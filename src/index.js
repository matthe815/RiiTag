
const {Canvas} = require("canvas");
const userManager = require("./user-manager");
const Cover = require("./Cover");

const {getImage, savePNG} = require("./utils");

const fs = require("fs"), 
      events = require("events"), 
      path = require("path");

const dataFolder = path.resolve(__dirname, "..", "data");

const guests = {"a": "Guest A","b": "Guest B","c": "Guest C","d": "Guest D","e": "Guest E","f": "Guest F"};
const guestList = Object.keys(guests);
guestList.push("undefined");

const defaultFont = "RodinNTLG";

const defaultDrawOrder = [
    "overlay",
    "covers",
    "flag",
    "coin",
    "avatar",
    "username",
    "coin_count",
    "friend_code"
]

/**
 * @typedef {Object} Vector2D
 * @property {number} width
 * @property {number} height
 */
class Tag extends events.EventEmitter{
    constructor(user, doMake=true) {
        super();

        this.user = userManager.load(user);
        this.overlay = this.loadOverlay(this.user.overlay);

        if (doMake) this.makeBanner();
    }

    /**
     * Draw text onto the tag.
     * @param {string} font 
     * @param {number} size 
     * @param {string} style 
     * @param {string} color 
     * @param {string} text 
     * @param {number} x 
     * @param {number} y 
     */
    drawText(font, size, style, color, text, x, y) {
        this.ctx.font = `${style} ${size}px ${font}`;
        this.ctx.fillStyle = color;
        this.ctx.fillText(text, size + x, size + y);
    }

    /**
     * Draw an image onto the tag.
     * @param {string} source A URL based image source.
     * @param {number} x 
     * @param {number} y 
     */
    async drawImage(source, x=0, y=0) {
        this.ctx.drawImage(await getImage(source), x, y);
    }

    /**
     * Draw a resized version of a provided image.
     * @param {string} source 
     * @param {number} x 
     * @param {number} y 
     * @param {number} shrinkx 
     * @param {number} shrinky 
     */
    async drawImageShrink(source, x=0, y=0, shrinkx=0, shrinky=0) {
        this.ctx.drawImage(source, x, y, shrinkx, shrinky);
    }

    /**
     * Fetch an image from the provided source repository, and draw a resized version onto the tag.
     * @param {string} source 
     * @param {number} x 
     * @param {number} y 
     * @param {number} shrinkx 
     * @param {number} shrinky 
     */
    async getAndDrawImageShrink(source, x=0, y=0, shrinkx=0, shrinky=0) {
        this.ctx.drawImage(await getImage(source), x, y, shrinkx, shrinky);
    }

    /**
     * Return the user's coin image.
     * @returns {image}
     */
    getCoinImage()
    {
        if (!this.user.coin) // Stop the operation if the user has no specified coin.
            return "mario";

        return (this.user.coin == "default") ? 
            this.overlay.coin_icon.img 
            : this.user.coin;
    }

    /**
     * Obtain the font to be used when drawing text.
     * @param {string} type The field-type to insert into.
     * @returns {string}
     */
    getFont(type) {
        if (this.user.font != "default" && this.overlay[type].force_font != "true")
            return this.user.font;
        else
            return defaultFont;
    }

    /**
     * Build an API cover-url using provided parameters.
     * @param {Cover} cover
     * @returns {string}
     */
    getCoverUrl(cover) {
        return `https://art.gametdb.com/${cover.getConsole()}/${cover.getType()}/${cover.getRegion}/${cover.game}.${cover.getExtension()}`;
    }

    /**
     * Download and cache a game cover, if a cache already exists it'll return the cache.
     * @param {Cover} cover
     */
    async getCover(cover) {
        return this.downloadCover(cover);
    }

    /**
     * Download a game cover and then save it to the 
     * @param {Cover} cover
     */
    async downloadCover(cover) {
        let dimensions = this.getCoverDimensions(covertype, consoletype);
        let canvas = new Canvas(dimensions.width, dimensions.height)
                        .getContext("2d");

        let image = await getImage(this.getCoverUrl(cover));
        canvas.drawImage(image, 0, 0, dimensions.width, dimensions.height);
        await savePNG(path.resolve(dataFolder, "cache", `${game}.png`), canvas);
        return canvas;
    }

    /**
     * Download the avatar provided for the tag.
     */
    async downloadAvatar() {
        if (!fs.existsSync(path.resolve(dataFolder, "avatars")))
            fs.mkdirSync(path.resolve(dataFolder, "avatars"));

        let canvas = new Canvas.Canvas(512, 512).getContext("2d"),
            avatar = await getImage(`https://cdn.discordapp.com/avatars/${this.user.id}/${this.user.avatar}.jpg?size=512`);

        canvas.drawImage(avatar, 0, 0, 512, 512);
        await savePNG(path.resolve(dataFolder, "avatars", `${this.user.id}.png`), canvas);
    }

    /**
     * Draw the cover onto the the tag.
     * @param {string} game 
     * @param {boolean} draw Whether or not to commit.
     * @returns {boolean} Whether or not the operation succeeded.
     */
    async drawGameCover(game, draw) {
        game = game.replace(/\w{0,5}(?=-)/, "");

        let cover = new Cover(game, user),
            cache = await this.getCover(cover);

        if (cache && draw) {
            let inc = 0;

            switch (cover.getConsole()) {
                case "ds":
                case "3ds":
                    inc = cover.getType() == "box" ? 87 : 80;
            }

            await this.drawImage(path.resolve(dataFolder, "cache", `${game}.png`), this.covCurX, this.covCurY + inc);
            this.covCurX += this.covIncX;
            this.covCurY += this.covIncY;
        }

        return cache;
    }

    /**
     * Draw the user avatar onto the tag.
     */
    async drawAvatar() {
        if (!this.overlay.avatar)
            return;

        await this.cacheAvatar();
        await this.getAndDrawImageShrink(path.resolve(dataFolder, "avatars", `${this.user.id}.png`), this.overlay.avatar.x, this.overlay.avatar.y, this.overlay.avatar.size, this.overlay.avatar.size);
    }

    /**
     * Draw the user mii onto the tag.
     */
    async drawMii() {
        if (!this.user.mii_data || this.user.mii_data == "")
            this.user.mii_data = "undefined";

        if (!this.overlay.mii)
            return;
        
        if (guestList.includes(this.user.mii_data))
            await this.getAndDrawImageShrink(path.resolve(dataFolder, "miis", "guests", `${this.user.mii_data}.png`), this.overlay.mii.x, this.overlay.mii.y, this.overlay.mii.size, this.overlay.mii.size);
        else {
            await this.getAndDrawImageShrink(path.resolve(dataFolder, "miis", `${this.user.id}.png`), this.overlay.mii.x, this.overlay.mii.y, this.overlay.mii.size, this.overlay.mii.size).catch(async e => {
                await this.getAndDrawImageShrink(path.resolve(dataFolder, "miis", "guests", `undefined.png`), this.overlay.mii.x, this.overlay.mii.y, this.overlay.mii.size, this.overlay.mii.size);
            });
        }
    }

    /**
     * Load a required font into memory.
     * @param {string} file 
     */
    async loadFont(file) {
        let font = JSON.parse(fs.readFileSync(path.resolve(dataFolder, "fonts", file)));
        
        return new Promise(function(resolve) {
            for (var style of font.styles) {
                Canvas.registerFont(path.resolve(dataFolder, "fontfiles", style.file),
                    {
                        family: font.family,
                        weight: style.weight,
                        style: style.style
                    }
                );
                resolve();
            }
        });
    }

    /**
     * Load multiple required fonts into memory.
     */
    async loadFonts() {
        for (var font of fs.readdirSync(path.resolve(dataFolder, "fonts"))) {
            await this.loadFont(font);
        }
    }

    /**
     * Get the user's current coin count.
     * @returns {number}
     */
    getCoins() {
        return Math.min(this.user.coins, this.overlay.coin_count.max);
    }

    loadOverlay(file) {
        var overlay = JSON.parse(fs.readFileSync(path.resolve(dataFolder, "overlays", file)));
        
        this.covStartX = overlay.cover_start_x;
        this.covStartY = overlay.cover_start_y;
        
        var covertype = this.getCoverType(false);
        
        if (covertype == "cover") {
            this.covStartY += 24;
        } else if (covertype == "disc") {
            this.covStartY += 88;
        }

        this.covIncX = overlay.cover_increment_x;
        this.covIncY = overlay.cover_increment_y;
    
        this.covCurX = this.covStartX;
        this.covCurY = this.covStartY;
    
        return overlay;
    }

    

    async makeBanner() {
        await this.loadFonts();
        var i = 0;

        this.canvas = new Canvas(this.overlay.width, this.overlay.height);
        this.ctx = this.canvas.getContext("2d");

        // background
        await this.drawImage(path.resolve(dataFolder, this.user.bg));

        // overlay image
        await this.drawImage(path.resolve(dataFolder, this.overlay.overlay_img));

        // game covers
        var games_draw = []
        
        if (this.user.sort.toLowerCase() != "none") {
            for (var game of this.user.games.reverse().slice(this.overlay.max_covers * -1)) {
                if (i < this.overlay.max_covers && game != "") {
                    var draw = await this.drawGameCover(game, false);
                    if (draw) {
                        games_draw.push(game)
                        i++;
                    }
                }
            }
        }

        // this code basically finds any blank spots where covers can be
        // the blank spots are because it can't find the cover
        // if there's blank spots, fill them in with covers until we reac the maximum amount
        for (let j = this.overlay.max_covers; j < this.user.games.length; j++) {
            if (games_draw.length < this.overlay.max_covers && games_draw.length != this.user.games.length && game != "" && !games_draw.includes(this.user.games.reverse()[j])) {
                var draw = await this.drawGameCover(this.user.games.reverse()[j], false);
                if (draw) {
                    games_draw.unshift(this.user.games.reverse()[j])
                }
            }
        }

        // finally draw the covers
        for (var game of games_draw) {
            var draw = await this.drawGameCover(game, true);
        }

        // flag icon
        await this.drawImage(path.resolve(dataFolder, "flags", `${this.user.region}.png`),
            this.overlay.flag.x,
            this.overlay.flag.y);

        // coin image/text
        await this.drawImage(path.resolve(dataFolder, "img", "coin", this.getCoinImage() + ".png"),
            this.overlay.coin_icon.x,
            this.overlay.coin_icon.y);

        // username text
        await this.drawText(this.getFont("username"),
            this.overlay.username.font_size,
            this.overlay.username.font_style,
            this.overlay.username.font_color,
            this.user.name,
            this.overlay.username.x,
            this.overlay.username.y)

        // friend code text
        await this.drawText(this.getFont("friend_code"),
            this.overlay.friend_code.font_size,
            this.overlay.friend_code.font_style,
            this.overlay.friend_code.font_color,
            this.user.friend_code,
            this.overlay.friend_code.x,
            this.overlay.friend_code.y);

        // coin count text
        await this.drawText(this.getFont("coin_count"),
            this.overlay.coin_count.font_size,
            this.overlay.coin_count.font_style,
            this.overlay.coin_count.font_color,
            this.getCoins(),
            this.overlay.coin_count.x,
            this.overlay.coin_count.y);

        // avatar
        if (this.user.useavatar == "true") {
            if (this.overlay.avatar.background) {
                await this.drawImage(path.resolve(dataFolder, this.overlay.avatar.background),
                    this.overlay.avatar.background_x,
                    this.overlay.avatar.background_y
                );
            }
            await this.drawAvatar();
        }

        if (this.user.usemii == "true") {
            if (this.overlay.mii.background) {
                await this.drawImage(path.resolve(dataFolder, this.overlay.avatar.background),
                    this.overlay.mii.background_x,
                    this.overlay.mii.background_y
                );
            }
            await this.drawMii();
        }

        await this.savePNG(path.resolve(dataFolder, "tag", `${this.user.id}.max.png`), this.canvas);

        this.canvas2 = new Canvas.Canvas(this.overlay.width / 3, this.overlay.height / 3);
        this.ctx = this.canvas2.getContext("2d");
        await this.drawImageShrink(this.canvas, 0, 0, this.overlay.width / 3, this.overlay.height / 3);
        await this.savePNG(path.resolve(dataFolder, "tag", `${this.user.id}.png`), this.canvas2);

        this.emit("done");
    }
}

module.exports = Tag;

if (module == require.main) {
    var jstring = fs.readFileSync(path.resolve(dataFolder, "debug", "user1.json"));
  
    var banner = new Tag(jstring, true);
    var maxbanner = new Tag(jstring, false);

    banner.once("done", function () {
        var out = fs.createWriteStream(path.resolve(dataFolder, "debug", "user1.png"));
        var stream = banner.pngStream;

        stream.on('data', function (chunk) {
            out.write(chunk);
        });
    });

    maxbanner.once("done", function () {
        var out = fs.createWriteStream(path.resolve(dataFolder, "debug", "user1.max.png"));
        var stream = banner.pngStream;

        stream.on('data', function (chunk) {
            out.write(chunk);
        });
    });
}