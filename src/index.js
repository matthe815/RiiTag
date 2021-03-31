
const { Canvas } = require('canvas')
const userManager = require('./user-manager')
const dataManager = require('./data-manager')
const cacheManager = require('./cache-manager')

const { getImage, savePNG } = require('./utils')

const fs = require('fs')
const events = require('events')
const path = require('path')

const guests = { a: 'Guest A', b: 'Guest B', c: 'Guest C', d: 'Guest D', e: 'Guest E', f: 'Guest F' }
const guestList = Object.keys(guests)
guestList.push('undefined')

const defaultFont = 'RodinNTLG'

/**
 * @typedef {Object} Vector2D
 * @property {number} width
 * @property {number} height
 */
class Tag extends events.EventEmitter {
  constructor (user, doMake = true) {
    super()

    this.user = userManager.load(user)
    this.overlay = this.loadOverlay(this.user.overlay)

    if (doMake) this.makeBanner()
  }

  /**
     * Draw any specified text onto the tag using specified font, and other parameters.
     * @param {string} font
     * @param {number} size
     * @param {string} style
     * @param {string} color
     * @param {string} text
     * @param {number} x
     * @param {number} y
     */
  drawText (font, size, style, color, text, x, y) {
    this.ctx.font = `${style} ${size}px ${font}`
    this.ctx.fillStyle = color
    this.ctx.fillText(text, size + x, size + y)
  }

  /**
     * Draw an image onto the tag.
     * @param {string} source A URL based image source.
     * @param {number} x
     * @param {number} y
     */
  async drawImage (source, x = 0, y = 0) {
    this.ctx.drawImage(await cacheManager.getLocal(source), x, y)
  }

  /**
     * Draw a resized version of a provided image.
     * @param {string} source
     * @param {number} x
     * @param {number} y
     * @param {number} shrinkx
     * @param {number} shrinky
     */
  async drawResizedImage (source, x = 0, y = 0, shrinkx = 0, shrinky = 0) {
    this.ctx.drawImage((await getImage(source)), x, y, shrinkx, shrinky)
  }

  /**
     * Return the user's coin image.
     * @returns {image}
     */
  getCoinImage () {
    // Stop the operation if the user has no specified coin.
    if (!this.user.coin) { return 'mario' }

    return (this.user.coin === 'default')
      ? this.overlay.coin_icon.img
      : this.user.coin
  }

  /**
     * Obtain the font to be used when drawing text.
     * @param {string} type The field-type to insert into.
     * @returns {string}
     */
  getFont (type) {
    if (this.user.font !== 'default' && this.overlay[type].force_font !== 'true') { return this.user.font } else { return defaultFont }
  }

  /**
     * Download and cache a game cover, if a cache already exists it'll return the cache.
     * @param {Cover} cover
     */
  async getCover (cover) {
    return cover.downloadCover()
  }

  /**
     * @deprecated
     */
  async downloadAvatar () {
    if (!fs.existsSync(path.resolve('data', 'avatars'))) { fs.mkdirSync(path.resolve('data', 'avatars')) }

    const canvas = new Canvas.Canvas(512, 512).getContext('2d')
    const avatar = await getImage(`https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.jpg?size=512`)

    canvas.drawImage(avatar, 0, 0, 512, 512)
    await savePNG(dataManager.build('avatars', this.user.id), canvas)
  }

  /**
     * Draw the cover onto the the tag.
     * @param {string} game
     * @param {boolean} draw Whether or not to commit.
     * @returns {boolean} Whether or not the operation succeeded.
     */
  async drawGameCover (game) {
    game = game.replace(/\w{0,5}(?=-)/, '')

    const image = await getImage(dataManager.build('cache', `${game.substr(1)}.png`))
    await this.drawImage(image, this.coverCurrentX, this.coverCurrentY)
    this.coverCurrentX += this.coverIncrementX
    this.coverCurrentY += this.coverIncrementY
  }

  /**
     * Draw the user avatar onto the tag.
     */
  async drawAvatar () {
    if (!this.overlay.avatar) { return }

    await this.cacheAvatar()
    await this.drawResizedImage(dataManager.build('avatar', this.user.id), this.overlay.avatar.x, this.overlay.avatar.y, this.overlay.avatar.size, this.overlay.avatar.size)
  }

  /**
     * Draw the user mii onto the tag.
     */
  async drawMii () {
    if (!this.user.mii_data || this.user.mii_data === '') { this.user.mii_data = 'undefined' }

    if (!this.overlay.mii) { return }
    // Override with mii data.
    if (guestList.includes(this.user.mii_data)) { return await this.drawResizedImage(dataManager.build(`miis/guests/${this.user.mii_data}.png`), this.overlay.mii.x, this.overlay.mii.y, this.overlay.mii.size, this.overlay.mii.size) }

    await this.drawResizedImage(dataManager.build('miis', `${this.user.id}.png`), this.overlay.mii.x, this.overlay.mii.y, this.overlay.mii.size, this.overlay.mii.size).catch(async e => {
      await this.drawResizedImage(dataManager.build('miis', 'guests', 'undefined.png'), this.overlay.mii.x, this.overlay.mii.y, this.overlay.mii.size, this.overlay.mii.size)
    })
  }

  /**
     * Load a required font into memory.
     * @param {string} file
     */
  async loadFont (file) {
    const font = JSON.parse(fs.readFileSync(dataManager.build('fonts', file)))

    return new Promise(resolve => {
      font.styles.forEach(style => {
        require('canvas').registerFont(dataManager.build('fontfiles', style.file),
          {
            family: font.family,
            weight: style.weight,
            style: style.style
          }
        )
        resolve()
      })
    })
  }

  /**
     * Load multiple required fonts into memory.
     */
  async loadFonts () {
    fs.readdirSync(dataManager.build('fonts')).forEach(async font => {
      await this.loadFont(font)
    })
  }

  /**
     * Get the user's current coin count.
     * @returns {number}
     */
  getCoins () {
    return Math.min(this.user.coins, this.overlay.coin_count.max)
  }

  /**
     * Load the user's overlay from a JSON file and build it.
     * @param {string} file
     */
  loadOverlay (file) {
    const overlay = JSON.parse(fs.readFileSync(dataManager.build('overlays', file)))

    this.coverStartX = overlay.cover_start_x
    this.coverStartY = overlay.cover_start_y

    const covertype = 'ds'

    this.coverStartY += covertype === 'cover' ? 24 : 88

    this.coverIncrementX = overlay.cover_increment_x
    this.coverIncrementY = overlay.cover_increment_y

    this.coverCurrentX = this.coverStartX
    this.coverCurrentY = this.coverStartY

    return overlay
  }

  /**
     * Completely generate the banner required for the tag.
     */
  async makeBanner () {
    await this.loadFonts()

    this.canvas = new Canvas(this.overlay.width, this.overlay.height)
    this.ctx = this.canvas.getContext('2d')

    // background
    await this.drawImage(dataManager.build(this.user.bg))

    // overlay image
    await this.drawImage(dataManager.build(this.overlay.overlay_img))

    // game covers
    const gamesDraw = []

    if (this.user.sort.toLowerCase() !== 'none') { // Apply the user sort preference.
      this.user.games.reverse().slice(this.overlay.max_covers * -1).forEach(async game => {
        await this.drawGameCover(game)
      })
    }

    // Loop through the previously defined array and draw the games.
    gamesDraw.forEach(async game => {
      await this.drawGameCover(game, true)
    })

    // flag icon
    await this.drawImage(dataManager.build('flags', `${this.user.region}.png`),
      this.overlay.flag.x,
      this.overlay.flag.y)

    // coin image/text
    await this.drawImage(dataManager.build('img', 'coin', `${this.getCoinImage()}.png`),
      this.overlay.coin_icon.x,
      this.overlay.coin_icon.y)

    // username text
    await this.drawText(this.getFont('username'),
      this.overlay.username.font_size,
      this.overlay.username.font_style,
      this.overlay.username.font_color,
      this.user.name,
      this.overlay.username.x,
      this.overlay.username.y)

    // friend code text
    await this.drawText(this.getFont('friend_code'),
      this.overlay.friend_code.font_size,
      this.overlay.friend_code.font_style,
      this.overlay.friend_code.font_color,
      this.user.friend_code,
      this.overlay.friend_code.x,
      this.overlay.friend_code.y)

    // coin count text
    await this.drawText(this.getFont('coin_count'),
      this.overlay.coin_count.font_size,
      this.overlay.coin_count.font_style,
      this.overlay.coin_count.font_color,
      this.getCoins(),
      this.overlay.coin_count.x,
      this.overlay.coin_count.y)

    // avatar
    if (this.user.useavatar === 'true') {
      if (this.overlay.avatar.background) {
        await this.drawImage(dataManager.build(this.overlay.avatar.background),
          this.overlay.avatar.background_x,
          this.overlay.avatar.background_y
        )
      }
      await this.drawAvatar()
    }

    if (this.user.usemii === 'true') {
      if (this.overlay.mii.background) {
        await this.drawImage(dataManager.build(this.overlay.avatar.background),
          this.overlay.mii.background_x,
          this.overlay.mii.background_y
        )
      }
      await this.drawMii()
    }

    await savePNG(dataManager.build('tag', `${this.user.id}.png`), this.canvas)
    this.emit('done')
  }
}

module.exports = Tag

if (module === require.main) {
  const jstring = fs.readFileSync(dataManager.build('debug', 'user1.json'))
  const banner = new Tag(jstring, true)
  const maxbanner = new Tag(jstring, false)
  const stream = banner.pngStream

  banner.once('done', () => {
    const out = fs.createWriteStream(dataManager.build('debug', 'user1.png'))

    stream.on('data', chunk => {
      out.write(chunk)
    })
  })

  maxbanner.once('done', () => {
    const out = fs.createWriteStream(dataManager.build('debug', 'user1.max.png'))

    stream.on('data', chunk => {
      out.write(chunk)
    })
  })
}
