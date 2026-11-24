// Renders a sample slideshow with no external images, to check the renderer works.
import { saveDraft } from "../drafts.js";
const d = await saveDraft({
  title: "render test",
  caption: "test #slideshow",
  slides: [
    { image: "color:linear-gradient(160deg,#f6d365,#fda085)", text: "5 things I wish I knew\nbefore my first marathon", position: 45, fontSize: 78 },
    { image: "color:#1d3557", text: "1. Slow runs build the engine", style: "plain", position: 30 },
    { image: "color:#e9ecef", text: "2. Fuel before you're hungry", style: "box", position: 70 },
  ],
});
console.log(d.renders.join("\n"));
