import type { Metadata } from "next";
import { BanksView } from "@/components/pages/banks";
export const metadata: Metadata = { title: "Banks and products" };
export default function Page() { return <BanksView />; }
