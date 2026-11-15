import type { Metadata } from "next";
import { UploadCompare } from "@/components/upload-compare";

export const metadata: Metadata = {
  title: "Upload your own | Tango",
  description: "Compare two of your own images on your device. Automatic checks run first, then a plain-language overview. Nothing is uploaded.",
};
export default function Page() { return <UploadCompare />; }
