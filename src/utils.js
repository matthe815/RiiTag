const fs = require("fs");
const Canvas = require("canvas");
const Image = Canvas.Image;

async function savePNG(out, c) {
    return new Promise((resolve) => {
        c.createPNGStream().pipe(fs.createWriteStream(out)).on("close", resolve());
    });
}

async function getImage(source) {
    var img = new Image();
    return new Promise((resolve, reject) => {
        img.onload = () => {resolve(img)};
        img.onerror = (err) => {reject(err)};
        img.src = source;
    })
}

module.exports = {
    savePNG,
    getImage,
}