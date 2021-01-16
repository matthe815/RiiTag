const path = require("path"),
      fs = require("fs");

/**
 * Data folder
 * @deprecated
 */
module.exports.dataFolder = path.resolve(__dirname, "..", "data");

class DataManager {
}

module.exports = DataManager;
/**
* Retrieve data from one of the internal data folders.
* @param {string[]} folder 
*/
module.exports.build = (...part) => {
   return path.resolve(this.dataFolder, part.join("/"))
}

module.exports.DataType = {
   BACKGROUNDS: 0,
   OVERLAYS: 1,
   FLAGS: 2,
   COINS: 3,
   COVERTYPES: 4,
   REGIONS: 5,
   FONTS: 6
}

/**
 * Obtain a list of backgrounds.
 * @returns {string[]}
 */
module.exports.getBackgrounds = () => {
    return fs.readdirSync(module.exports.build("img", "1200x450"));
}

/**
 * Obtain a list of avaliable overlays.
 * @returns {strings}
 */
module.exports.getOverlays = () => {
    var overlays = [];
    fs.readdirSync(module.exports.build("overlays")).forEach((overlayFile) => {
        overlays.push(JSON.parse(fs.readFileSync(module.exports.build("overlays", overlayFile))));
    });
    return overlays;
}

/**
 * Get a list of all flags.
 */
module.exports.getFlags = () => {
    return JSON.parse(fs.readFileSync(module.exports.build("meta", "flags.json")));
}

/**
 * Get a list of all coins.
 */
module.exports.getCoins = () => {
    return JSON.parse(fs.readFileSync(module.exports.build("meta", "coin.json")));
}

/**
 * Get a list of all cover types.
 */
module.exports.getCoverTypes = () => {
    return ["cover3D", "cover", "disc"];
}

/**
 * Get a list of regions.
 */
module.exports.getRegions = () => {
    return ["EN", "FR", "DE", "ES", "IT", "NL", "PT", "AU", "SE", "DK", "NO", "FI", "TR"];
}

/**
 * Get a list of fonts.
 */
module.exports.getFonts = () => {
    return JSON.parse(fs.readFileSync(module.exports.build("meta", "fonts.json")))
}

// /**
//  * Get a 
//  */
// module.exports.getData = (dataType) => {
//    switch(dataType) {
//       case module.exports.build.DataType.BACKGROUNDS:
//          return module.exports.build.getBackgrounds();
//       case module.exports.build.DataType.OVERLAYS:
//          return module.exports.build.getOverlays();
//       case module.exports.build.DataType.COINS:
//          return module.exports.build.getCoins();
//       case module.exports.build.DataType.COVERTYPES:
//          return module.exports.build.getCoverTypes();
//       case module.exports.build.DataType.FLAGS:
//          return module.exports.build.getFlags();
//       case module.exports.build.DataType.FONTS:
//          return module.exports.build.getFonts();
//       case module.exports.build.DataType.REGIONS:
//          return module.exports.build.getRegions();
//       default:
//          return null;
//    }
// }