import path from "node:path";
import { chromium } from "playwright";
const dir = import.meta.dirname;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
await p.goto("file://" + path.join(dir, "logo.html"));
await p.screenshot({ path: path.join(dir, "logo-1024.png") });
await b.close();
