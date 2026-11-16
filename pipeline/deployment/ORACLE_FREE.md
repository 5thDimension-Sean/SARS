# Permanent worker on Oracle Cloud Always Free

Vercel stays the front end. This VM runs the Python worker that finds and processes NISAR scenes for any
coordinate. Vercel cannot run it: scenes are gigabytes and jobs take minutes.

## 1. Create the VM (you do this in Oracle's console)
1. Keep the account on **Free Trial / Always Free**. Do not upgrade to Pay As You Go or provision paid
   shapes using trial credits. Use the tenancy's home region and confirm Always Free eligibility.
2. Compute → Instances → Create. Image **Ubuntu 24.04** (or 22.04). Shape **VM.Standard.A1.Flex**, 2 OCPU and
   exactly **12 GB memory**. Boot volume **100 GB**, Balanced performance, with no extra volumes or paid
   services. Check existing usage: the free account allowance is 2 OCPUs, 12 GB RAM and 200 GB of combined
   boot/block storage across the tenancy. These are aggregate limits, not per-instance allowances.
   "Out of host capacity" is common: retry later or pick another availability domain.
3. Add your SSH key. In the VM's subnet security list, allow inbound TCP **80 and 443** only. Keep SSH (22)
   limited to your own IP (/32). Never open 8090. Avoid optional log-ingestion or metered security services.
4. Note the public IP. For a free hostname with a real certificate use `<ip-with-dashes>.sslip.io`
   (for example `203-0-113-10.sslip.io`), or point your own domain at the IP.

Always Free eligibility does not guarantee permanent availability: Oracle can reclaim idle instances.
Do not upgrade or select a paid substitute when free A1 capacity is unavailable. Try another availability
domain in the home region, or retry later. No deployment should require a shared Earthdata token.

Oracle's current limits: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

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
