const { getImage } = require('./utils')
const fs = require('fs')
const dataManager = require('./data-manager')

const cacheFolder = 'cache'

class cacheManager {

}

module.exports = cacheManager

module.exports.getLocal = async path => {
  return await getImage(path)
}

/**
* Download an image from the specified URL and cache it. Retrieve from the cache if it already exists.
*  @param {string} sourceUrl
*  @param {string} key
* @returns {Image}
*/
module.exports.get = async (sourceUrl, key = sourceUrl) => {
  // Create the cache folder if not existant.
  if (!fs.existsSync(dataManager.build(cacheFolder))) { fs.mkdirSync(dataManager.build(cacheFolder)) }

  // If the cache file already exists, just return that instead.
  if (fs.existsSync(dataManager.build(cacheFolder, `${key}.png`))) { return fs.readFileSync(dataManager.build(cacheFolder, `${key}.png`)) }

  const image = await getImage(sourceUrl)
  fs.writeFileSync(dataManager.build(cacheFolder, `${key}.png`), image)

  return image
}

/**
* Retrieve from the cache if it already exists. Will not download the file if it doesn't exist.
*  @param {string} key
* @returns {Image}
*/
module.exports.getCache = async (key) => {
  // Create the cache folder if not existant.
  if (!fs.existsSync(dataManager.build(cacheFolder))) { fs.mkdirSync(dataManager.build(cacheFolder)) }

  // If the cache file already exists, just return that instead.
  if (fs.existsSync(dataManager.build(cacheFolder, `${key}.png`))) { return fs.readFileSync(dataManager.build(cacheFolder, `${key}.png`)) }

  return null
}
