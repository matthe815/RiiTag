const { Canvas } = require('canvas')
const { savePNG, getImage } = require('./utils')
const dataManager = require('./data-manager')

/**
 * The base Cover constructor and de-constructor.
 */
class Cover {
  constructor (game, user) {
    this.game = game.substr(1)
    this.user = user
  }

  /**
     * Use the game's ID to determine the current region.
     */
  getRegion () {
    const regionCode = this.game[3]

    switch (regionCode) {
      case 'P':
        if (this.user.coverregion && this.user.coverregion.toUpperCase().length === 2) { return this.user.coverregion.toUpperCase() }
        break
      case 'E':
        return 'US'
      case 'J':
        return 'JA'
      case 'K':
        return 'KO'
      case 'W':
        return 'TW'
      default:
        return 'EN'
    }
  }

  /**
     * Use the ID structure to determine the current console.
     * @param {string} game
     */
  getConsole () {
    const consoleCode = this.game[0] // Obtain the console-level code.
    const consoleBase = this.game.substr(0, this.game.indexOf('-')) // Strip everything behind the hyphen to obtain the base.

    switch (consoleBase) {
      case 'wii':
        return 'wii'
      case 'wiiu':
        return 'wiiu'
      case 'ds':
        return 'ds'
      case '3ds':
        return '3ds'
      default:
        switch (consoleCode) {
          case 'A':
          case 'B':
            return 'wiiu'
          case 'R':
          case 'S':
            return 'wii'
          default:
            break
        }
    }
  }

  /**
     * Determine the file extension by the console and cover type.
     * @param {string} cover
     * @param {string} console
     */
  getExtension () {
    if (this.getConsole() !== 'wii' && this.getType() === 'cover') { return 'jpg' }

    return 'png'
  }

  /**
     * Obtain the type of cover based on console type.
     * @param {string} consoletype
     */
  getType () {
    switch (this.getConsole()) {
      case 'ds':
      case '3ds':
        return 'box'
      default:
        return 'cover3D'
    }
  }

  /**
     * Obtain cover dimensions by specified cover-type.
     * @param {string} type
     * @returns {Vector2D}
     */
  getDimensions () {
    switch (this.getType()) {
      case 'cover':
        return { width: 160, height: (this.getConsole() === 'ds' || this.getConsole() === '3ds') ? 144 : 224 }
      case 'cover3D':
        return { width: 176, height: 248 }
      case 'disc':
        return { width: 160, height: 160 }
      case 'box':
        return { width: 176, height: 248 }
      default:
        break
    }
  }

  async downloadCover () {
    const dimensions = this.getDimensions()
    const canvas = new Canvas(dimensions.width, dimensions.height)
    const ctx = canvas.getContext('2d')

    const image = await getImage(module.exports.getCoverUrl(this))
    ctx.drawImage(image, 0, 0, dimensions.width, dimensions.height)
    await savePNG(dataManager.build('cache', `${this.game}.png`), canvas)
    return canvas
  }
}

module.exports = Cover

/**
* Build an API cover-url using provided parameters.
* @param {Cover} cover
* @returns {string}
*/
module.exports.getCoverUrl = (cover) => {
  return `https://art.gametdb.com/${cover.getConsole()}/${cover.getType()}/${cover.getRegion()}/${cover.game}.${cover.getExtension()}`
}
