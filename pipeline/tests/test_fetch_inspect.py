"""Offline search/auth/download tests and metadata-only HDF5 inspection checks."""

from __future__ import annotations

from io import StringIO
import json
from pathlib import Path
from types import SimpleNamespace

import h5py
import numpy as np
import pytest

from pipeline import fetch_nisar, inspect_h5
from pipeline.common import PipelineError


def fake_asf() -> SimpleNamespace:
    return SimpleNamespace(DATASET=SimpleNamespace(NISAR="NISAR"), PRODUCT_TYPE=SimpleNamespace(GCOV="GCOV"),
                           INSTRUMENT=SimpleNamespace(L_SAR="L-SAR"), __version__="test")


def product(filename: str = "NISAR_L2_PR_GCOV_example.h5", size: int | None = None) -> SimpleNamespace:
    return SimpleNamespace(properties={"fileName": filename, "url": f"https://example.test/{filename}?token=private-url-secret",
        "startTime": "2026-07-03T12:00:00Z", "frameNumber": 70, "pathNumber": 25, "flightDirection": "ASCENDING",
        "bytes": {filename: {"bytes": size, "format": "HDF5"}}, "collectionName": "NISAR_L2_GCOV_PROVISIONAL_V1",
        "sceneName": "NISAR_EXAMPLE", "crid": "X05010", "pgeVersion": "1.2.3"}, umm={})


@pytest.fixture
def hdf_payload(tmp_path: Path) -> bytes:
    path = tmp_path / "source.h5"
    with h5py.File(path, "w") as handle:
        handle.create_dataset("metadata", data=np.bytes_("NISAR"))
    return path.read_bytes()


def test_search_uses_verified_nisar_l_band_filters() -> None:
    args = fetch_nisar.parser().parse_args(["--bbox=-81,25,-80,26", "--start", "2026-07-03", "--end", "2026-07-15", "--track", "25", "--frame", "70"])
    query = fetch_nisar.search_kwargs(args, fake_asf())
    assert query["dataset"] == "NISAR" and query["processingLevel"] == "GCOV"
    assert query["instrument"] == "L-SAR" and query["relativeOrbit"] == 25 and query["frame"] == 70
    assert query["start"] == "2026-07-03T00:00:00Z"
    assert query["end"] == "2026-07-15T23:59:59.999999Z"
    assert "POLYGON" in query["intersectsWith"]


def test_missing_installed_constants_fail_clearly(monkeypatch: pytest.MonkeyPatch) -> None:
    asf = fake_asf()
    del asf.PRODUCT_TYPE.GCOV
    monkeypatch.setattr(fetch_nisar.importlib, "import_module", lambda _: asf)
    with pytest.raises(PipelineError, match="PRODUCT_TYPE.GCOV"):
        fetch_nisar.load_asf()


def test_dry_run_does_not_authenticate_or_create_files(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    asf = fake_asf()
    asf.search = lambda **_: [product(size=128)]
    monkeypatch.setattr(fetch_nisar, "load_asf", lambda: asf)
    monkeypatch.setattr(fetch_nisar, "authenticated_session", lambda _: pytest.fail("dry run authenticated"))
    out = tmp_path / "downloads"
    status = fetch_nisar.main(["--bbox=-81,25,-80,26", "--start", "2026-07-03", "--end", "2026-07-15", "--out", str(out), "--dry-run"])
    output = capsys.readouterr().out
    assert status == 0 and not out.exists()
    assert "PROVISIONAL" in output and "X05010" in output and "DRY RUN" in output
    assert "private-url-secret" not in output


def test_existing_valid_download_skips_auth_and_writes_safe_sidecar(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, hdf_payload: bytes) -> None:
    entry = product(size=len(hdf_payload))
    target = tmp_path / entry.properties["fileName"]
    target.write_bytes(hdf_payload)
    monkeypatch.setattr(fetch_nisar, "authenticated_session", lambda _: pytest.fail("existing file triggered authentication"))
    fetch_nisar.download_products([entry], tmp_path, fake_asf())
    assert target.read_bytes() == hdf_payload
    sidecar = json.loads(target.with_name(target.name + ".asf.json").read_text())
    assert sidecar["dataMaturity"] == "PROVISIONAL" and sidecar["compositeReleaseId"] == "X05010"
    assert "private-url-secret" not in json.dumps(sidecar) and "url" not in sidecar


def test_existing_incomplete_file_is_not_overwritten(tmp_path: Path, hdf_payload: bytes) -> None:
    entry = product(size=len(hdf_payload) + 1)
    target = tmp_path / entry.properties["fileName"]
    target.write_bytes(hdf_payload)
    with pytest.raises(PipelineError, match="not overwritten"):
        fetch_nisar.download_products([entry], tmp_path, fake_asf())
    assert target.read_bytes() == hdf_payload


def test_download_is_validated_then_published(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, hdf_payload: bytes) -> None:
    asf, entry = fake_asf(), product(size=len(hdf_payload))
    closed = []
    session = SimpleNamespace(close=lambda: closed.append(True))
    monkeypatch.setattr(fetch_nisar, "authenticated_session", lambda _, **kwargs: session)
    asf.download_url = lambda **kwargs: (Path(kwargs["path"]) / kwargs["filename"]).write_bytes(hdf_payload)
    fetch_nisar.download_products([entry], tmp_path, asf)
    assert (tmp_path / entry.properties["fileName"]).read_bytes() == hdf_payload
    assert closed == [True] and not list(tmp_path.glob(".nisar-download-*"))


def test_download_failure_does_not_expose_credentials(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    asf = fake_asf()
    asf.search = lambda **_: [product(size=100)]
    def fail(**_: object) -> None:
        raise RuntimeError("EARTHDATA_TOKEN=private-credential-secret URL=private-url-secret")
    asf.download_url = fail
    monkeypatch.setattr(fetch_nisar, "load_asf", lambda: asf)
    monkeypatch.setattr(fetch_nisar, "authenticated_session", lambda _, **kwargs: SimpleNamespace(close=lambda: None))
    status = fetch_nisar.main(["--bbox=-81,25,-80,26", "--start", "2026-07-03", "--end", "2026-07-15", "--out", str(tmp_path)])
    assert status == 2 and "private-credential-secret" not in caplog.text and "private-url-secret" not in caplog.text
    assert not (tmp_path / product().properties["fileName"]).exists()


@pytest.mark.parametrize("payload,expected", [(b"<html>login</html>", 18), (b"wrong-size", 100)])
def test_bad_download_never_becomes_completed_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, payload: bytes, expected: int) -> None:
    asf, entry = fake_asf(), product(size=expected)
    monkeypatch.setattr(fetch_nisar, "authenticated_session", lambda _, **kwargs: SimpleNamespace(close=lambda: None))
    asf.download_url = lambda **kwargs: (Path(kwargs["path"]) / kwargs["filename"]).write_bytes(payload)
    with pytest.raises(PipelineError):
        fetch_nisar.download_products([entry], tmp_path, asf)
    assert not (tmp_path / entry.properties["fileName"]).exists()
    assert not list(tmp_path.glob("*.asf.json")) and not list(tmp_path.glob(".nisar-download-*"))


def test_unknown_size_truncated_hdf5_is_not_skipped(tmp_path: Path, hdf_payload: bytes) -> None:
    entry = product(size=None)
    target = tmp_path / entry.properties["fileName"]
    target.write_bytes(hdf_payload[:16])
    with pytest.raises(PipelineError, match="not overwritten"):
        fetch_nisar.download_products([entry], tmp_path, fake_asf())
    assert target.read_bytes() == hdf_payload[:16]


def test_authentication_prefers_token_and_sanitizes_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = []
    session = SimpleNamespace(auth_with_token=lambda value: seen.append(value) or "authenticated")
    asf = fake_asf()
    asf.ASFSession = lambda: session
    monkeypatch.setenv("EARTHDATA_TOKEN", "private-credential-secret")
    assert fetch_nisar.authenticated_session(asf) == "authenticated" and seen == ["private-credential-secret"]
    def fail(_: str) -> None:
        raise RuntimeError("private-credential-secret")
    session.auth_with_token = fail
    with pytest.raises(PipelineError) as error:
        fetch_nisar.authenticated_session(asf)
    assert "private-credential-secret" not in str(error.value)


def test_explicit_request_token_does_not_use_or_change_process_credentials(monkeypatch):
    seen = []
    asf = fake_asf()
    asf.ASFSession = lambda: SimpleNamespace(auth_with_token=lambda token: seen.append(token) or "authenticated")
    monkeypatch.setenv("EARTHDATA_TOKEN", "different-process-test-token")
    assert fetch_nisar.authenticated_session(asf, token="per-request-test-token") == "authenticated"
    assert seen == ["per-request-test-token"]
    assert fetch_nisar.os.environ["EARTHDATA_TOKEN"] == "different-process-test-token"


def test_catalog_byte_dictionary_and_path_validation() -> None:
    assert fetch_nisar.expected_size({"bytes": {"scene.h5": {"bytes": "1500"}}}, "scene.h5") == 1500
    assert fetch_nisar.expected_size({"bytes": float("nan")}, "scene.h5") is None
    assert fetch_nisar.expected_size({"bytes": {}}, "scene.h5") is None
    with pytest.raises(PipelineError, match="unsafe"):
        fetch_nisar.product_filename(product("../unsafe.h5"))


def test_netrc_credentials_are_used_without_printing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    credentials_file = tmp_path / "earthdata.netrc"
    credentials_file.write_text("machine urs.earthdata.nasa.gov login test-user password private-netrc-secret\n")
    credentials_file.chmod(0o600)
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    monkeypatch.setenv("NETRC", str(credentials_file))
    received = []
    session = SimpleNamespace(auth_with_creds=lambda user, password: received.append((user, password)) or "authenticated")
    asf = fake_asf()
    asf.ASFSession = lambda: session
    assert fetch_nisar.authenticated_session(asf) == "authenticated"
    assert received == [("test-user", "private-netrc-secret")]
    output = capsys.readouterr()
    assert "private-netrc-secret" not in output.out + output.err


def test_missing_credentials_and_wrong_netc_entry_are_clear(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    credentials_file = tmp_path / "missing.netrc"
    monkeypatch.delenv("EARTHDATA_TOKEN", raising=False)
    monkeypatch.setenv("NETRC", str(credentials_file))
    asf = fake_asf()
    asf.ASFSession = lambda: SimpleNamespace()
    with pytest.raises(PipelineError, match="EARTHDATA_TOKEN"):
        fetch_nisar.authenticated_session(asf)
    credentials_file.write_text("machine different.example login user password private-netrc-secret\n")
    credentials_file.chmod(0o600)
    with pytest.raises(PipelineError, match="urs.earthdata.nasa.gov"):
        fetch_nisar.authenticated_session(asf)


def test_unknown_maturity_is_not_assumed_beta() -> None:
    entry = product()
    entry.properties["collectionName"] = "NISAR_L2_GCOV_V1"
    assert fetch_nisar.catalog_metadata(entry)["dataMaturity"] is None
    entry.umm = {"AdditionalAttributes": [{"Name": "DATA_MATURITY", "Values": ["BETA"]}]}
    assert fetch_nisar.catalog_metadata(entry)["dataMaturity"] == "BETA"


def test_inspect_reports_complete_tree_without_dataset_reads(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    path = tmp_path / "synthetic.h5"
    with h5py.File(path, "w") as handle:
        handle.attrs["mission"] = "NISAR"
        frequency = handle.create_group("science/LSAR/GCOV/grids/frequencyA")
        raster = frequency.create_dataset("HHHH", shape=(10000, 10000), dtype="float32", chunks=(64, 64))
        raster.attrs["units"] = "1"
        raster.attrs["large_attribute"] = np.arange(100)
        handle["alias"] = raster
        handle["soft"] = h5py.SoftLink(raster.name)
        handle["external"] = h5py.ExternalLink("missing.h5", "/external")
    def forbidden(*_: object, **__: object) -> None:
        pytest.fail("inspector attempted to read dataset values")
    monkeypatch.setattr(h5py.Dataset, "__getitem__", forbidden)
    monkeypatch.setattr(h5py.Dataset, "read_direct", forbidden)
    output = StringIO()
    inspect_h5.inspect_file(path, stream=output)
    text = output.getvalue()
    assert "shape=(10000, 10000) dtype=float32" in text and "@units: '1'" in text
    assert "[HARD LINK" in text and "[SOFT LINK" in text and "[EXTERNAL LINK" in text
    assert "100 items" in text and "value not read" in text and "no dataset values" in text


def test_inspect_cli_missing_file_reports_failure(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert inspect_h5.main([str(tmp_path / "missing.h5")]) == 2
    assert "Cannot inspect" in capsys.readouterr().err
