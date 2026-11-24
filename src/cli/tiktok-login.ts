// npm run tiktok:login -- <account-name>   (name is how you refer to the account when scheduling)
import { loginAccount } from "../tiktok/auth.js";
const a = await loginAccount(process.argv[2]);
console.log(`Connected TikTok account "${a.name}" (${a.displayName}). Scopes: ${a.scope}`);
