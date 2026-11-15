"""Explicit real-data deployment check. Set credentials locally, never in chat."""
from __future__ import annotations
import json
import os
import sys
import time
from urllib.parse import urlsplit

import requests


def main():
    endpoint = os.environ.get("PROCESSING_API_URL", "").rstrip("/")
    origin = os.environ.get("FRONTEND_ORIGIN", "")
    token = os.environ.get("EARTHDATA_TOKEN", "")
    url = urlsplit(endpoint)
    if not endpoint or not origin or not token:
        print("NOT RUN: set PROCESSING_API_URL, FRONTEND_ORIGIN and EARTHDATA_TOKEN locally.")
        return 2
    if url.scheme != "https" or url.username or url.password or url.query or url.fragment:
        print("NOT RUN: the backend must have a plain HTTPS URL.")
        return 2
    coordinates = {"latitude": 25.5, "longitude": -80.8}
    try:
        response = requests.post(endpoint + "/v1/jobs", json=coordinates,
                                 headers={"Origin": origin, "X-Earthdata-Token": token}, timeout=30, allow_redirects=False)
        token = ""
        response.raise_for_status()
        job = response.json()
        headers = {"Authorization": "Bearer " + job["accessToken"], "Origin": origin}
        path = endpoint + "/v1/jobs/" + job["id"]
        deadline = time.monotonic() + 1250
        while time.monotonic() < deadline:
            status = requests.get(path, headers=headers, timeout=30, allow_redirects=False)
            status.raise_for_status()
            data = status.json()
            if data["status"] in ("failed", "unavailable"):
                print("REAL-DATA CHECK DID NOT PASS:", data["status"])
                return 1
            if data["status"] == "ready":
                result = data["result"]
                if result["coordinates"] != coordinates or result["dates"][0] >= result["dates"][1]:
                    raise ValueError("Coordinate or date mismatch")
                if len(result["regions"]) != 3 or len(result["sourceFiles"]) != 2:
                    raise ValueError("Incomplete evidence")
                for pol in ("HH", "HV"):
                    evidence = result["evidence"][pol]
                    for i, key in enumerate(("firstCount", "secondCount")):
                        o = evidence["observations"][i]
                        if o["count"] <= 0 or "SYNTHETIC" in o["granuleId"]:
                            raise ValueError("Invalid source observation")
                        if sum(b[key] for b in evidence["bins"]) + o["outsideDisplayRange"] != o["count"]:
                            raise ValueError("Histogram count mismatch")
                    for image_path in result["images"][pol].values():
                        image = requests.get(path + "/image/" + image_path, headers=headers, timeout=30, allow_redirects=False)
                        if image.status_code != 200 or not image.content.startswith(b"\x89PNG\r\n\x1a\n"):
                            raise ValueError("Missing measured image")
                if requests.get(path, timeout=30, allow_redirects=False).status_code != 404:
                    raise ValueError("Unauthenticated results are accessible")
                print(json.dumps({"status": "PASSED_REAL_DEPLOYED_COMPARISON", "coordinates": coordinates,
                                  "dates": result["dates"], "sourceFiles": result["sourceFiles"],
                                  "scientificStatus": result["scientificStatus"]}, indent=2))
                return 0
            time.sleep(3)
        print("REAL-DATA CHECK DID NOT PASS: timeout")
        return 1
    except Exception:
        print("REAL-DATA CHECK DID NOT PASS: request, authentication or evidence validation failed. No credentials recorded.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
