const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const svgBuffer = fs.readFileSync(
  path.join(__dirname, "../resources/sprites/TransportSpaceship.svg"),
);

sharp(svgBuffer)
  .png()
  .toFile(path.join(__dirname, "../resources/sprites/transportship.png"))
  .then((info) => {
    console.log("Conversion complete:", info);
  })
  .catch((err) => {
    console.error("Error during conversion:", err);
  });
