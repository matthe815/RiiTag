const Canvas = require('canvas')
const utils = require('./utils')
const path = require('path')

const endpoint = 'http://miicontestp.wii.rc24.xyz/cgi-bin/render.cgi?data='

module.exports = async function (hex, id, dataFolder) {
  const c = new Canvas.Canvas(512, 512)
  const ctx = c.getContext('2d')
  let img
  try {
    img = await utils.getImage(`${endpoint}${hex}`)
    ctx.drawImage(img, 0, 0, 512, 512)
    await utils.savePNG(path.join(dataFolder, 'miis', id + '.png'), c)
  } catch (e) {
    console.error(e)
  }
}
