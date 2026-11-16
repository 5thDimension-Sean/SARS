# Permanent worker on Oracle Cloud Always Free

Vercel stays the front end. This VM runs the Python worker that finds and processes NISAR scenes for any
coordinate. Vercel cannot run it: scenes are gigabytes and jobs take minutes.

## 1. Create the VM (you do this in Oracle's console)
1. Create an Oracle Cloud account. Upgrade to **Pay As You Go**: it stays $0 within the free limits, and it
   stops Oracle reclaiming Always Free machines that look idle (this worker is idle most of the time).
2. Compute → Instances → Create. Image **Ubuntu 24.04** (or 22.04). Shape **VM.Standard.A1.Flex**, 2 OCPU and
   12 GB memory or more. Boot volume **100 GB or more** (the free allowance is about 200 GB in total).
   "Out of host capacity" is common: retry later or pick another availability domain.
3. Add your SSH key. In the VM's subnet security list, allow inbound TCP **80 and 443** only. Keep SSH (22)
   limited to your own IP if you can. Never open 8090.
4. Note the public IP. For a free hostname with a real certificate use `<ip-with-dashes>.sslip.io`
   (for example `203-0-113-10.sslip.io`), or point your own domain at the IP.

## 2. Install (on the VM)
```bash
curl -fsSLO https://raw.githubusercontent.com/5thDimension-Sean/SARS/feat/nisar-hackathon-ready/pipeline/deployment/oracle-setup.sh
less oracle-setup.sh   # read it first
PROCESSING_DOMAIN=203-0-113-10.sslip.io PROCESSING_ALLOWED_ORIGINS=https://tangosars.vercel.app bash oracle-setup.sh
```
This script lives on a feature branch until it is merged; use that branch's raw URL, or copy the file by hand.
`PROCESSING_ALLOWED_ORIGINS` must be the exact production origin (comma-separate extra origins).

## 3. Connect Vercel
Set `NEXT_PUBLIC_PROCESSING_API_URL=https://<your-hostname>` in Vercel's build settings and redeploy.
The page already shows the form only when that variable is a valid HTTPS URL.

## 4. Verify with real data
From your machine, with your own Earthdata token in the environment (not typed into shell history):
`PROCESSING_API_URL=https://<host> FRONTEND_ORIGIN=https://tangosars.vercel.app python -m pipeline.verify_coordinate_backend`

## Limits that stay in force
One job at a time, six accepted jobs per hour, 20-minute job limit, raw files deleted after processing,
results expire after 45 minutes. Each visitor uses their own Earthdata token; none is stored.
