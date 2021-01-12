const Banner = require("./src/index");
const fs = require("fs");
const path = require("path");
const dataFolder = path.resolve(__dirname, "data");
const json_string = fs.readFileSync(path.resolve(dataFolder, "debug", "user1.json"));
const DiscordStrategy = require("passport-discord").Strategy;
const passport = require("passport");
const config = loadConfig();
const session = require("express-session");
const bodyParser = require("body-parser");
const xml = require("xml");
const DatabaseDriver = require("./dbdriver");
const renderMiiFromHex = require("./src/rendermiifromhex");
const Axios = require("axios");

const db = new DatabaseDriver(path.join(__dirname, "users.db"));
const gameDb = new DatabaseDriver(path.join(__dirname, "games.db"));
const coinDb = new DatabaseDriver(path.join(__dirname, "coins.db"));
var wiiTDB = {};
const Sentry = require('@sentry/node');
const express = require("express");
// const { render } = require("pug");
const app = express();

const guests = {"a": "Guest A","b": "Guest B","c": "Guest C","d": "Guest D","e": "Guest E","f": "Guest F"};
const guestList = Object.keys(guests);
guestList.push("undefined");

const port = config.port || 3000;

Sentry.init({ dsn: config.sentryURL });

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());

app.set("view-engine", "pug");

passport.serializeUser(function(user, done) {
    done(null, user);
});
passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

var scopes = ['identify'];

passport.use(new DiscordStrategy({
    clientID: config.clientID,
    clientSecret: config.clientSecret,
    callbackURL: config.hostURL.replace("{{port}}", port) + "callback"
}, function(accessToken, refreshToken, profile, done) {
    return done(null, profile);
}));

app.use(session({
    secret: generateRandomKey(512)
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public/"));
app.use(express.static("data/"));

app.set("view engine", "pug");

app.get("/", function(req, res) {
    res.render("index.pug", { user: req.user, tags: getHomeTags() });
});


app.get("/demo", async function(req, res) {
    var banner = await new Banner(json_string);
    banner.once("done", function() {
        banner.pngStream.pipe(res);
    });
});

app.get('/login', function(req, res, next) {
    if (req.isAuthenticated()) {
        res.redirect("/");
    }
    next()
}, passport.authenticate('discord', { scope: scopes }));

app.get('/logout', function(req, res) {
    req.logout();
    res.redirect("/")
});

app.get('/callback',
    passport.authenticate('discord', { failureRedirect: '/' }), function(req, res) {
        res.cookie("uid", req.user.id);
        if (config.admins.includes(req.user.id)) {
            req.user.admin = true;
        } else {
            req.user.admin = false;
        }
        res.redirect("/create");
    } // auth success
);

app.route("/edit")
    .get(checkAuth, async function(req, res) {
        var jstring;
        try {
            jstring = fs.readFileSync(path.resolve(dataFolder, "users", req.user.id + ".json")).toString();
            var userKey = await getUserKey(req.user.id);
            if (userKey == undefined) {
                throw new Error("User Key is undefined");
            }
            res.render("edit.pug", {jstring: jstring,
                                    backgrounds: getBackgroundList(),
                                    jdata: JSON.parse(jstring),
                                    overlays: getOverlayList(),
                                    flags: getFlagList(),
                                    coins: getCoinList(),
                                    covertypes: getCoverTypes(),
                                    coverregions: getCoverRegions(),
                                    fonts: getFonts(),
                                    userKey: userKey,
                                    user: req.user
                                });
        } catch(e) {
            console.log(e);
            res.redirect("/create");
        }
    })
    .post(checkAuth, async function(req, res) {
        editUser(req.user.id, "bg", req.body.background);
        editUser(req.user.id, "overlay", req.body.overlay);
        editUser(req.user.id, "region", req.body.flag);
        editUser(req.user.id, "coin", req.body.coin);
        editUser(req.user.id, "name", req.body.name);
        editUser(req.user.id, "friend_code", req.body.wiinumber);
        editUser(req.user.id, "games", req.body.games.split(";"));
        editUser(req.user.id, "covertype", req.body.covertype);
        editUser(req.user.id, "coverregion", req.body.coverregion);
        editUser(req.user.id, "useavatar", req.body.useavatar);
        editUser(req.user.id, "usemii", req.body.usemii);
        editUser(req.user.id, "font", req.body.font);
        editUser(req.user.id, "mii_data", req.body.miidata);
        if (!guestList.includes(req.body.miidata)) {
            await renderMiiFromHex(req.body.miidata, req.user.id, dataFolder).catch(() => {
                console.log("Failed to render mii");
            });
        }
        res.redirect(`/${req.user.id}`);
        await getTag(req.user.id).catch(function () {
            res.status(404).render("notfound.pug");
            return
        });
    });

app.get("/admin", checkAdmin, function(req, res) {
    res.render("admin.pug", { user: req.user });
});

app.get("^/admin/refresh/:id([0-9]+)", checkAdmin, async function(req, res) {
    if (!req.params.id) {
        res.redirect(`/${req.user.id}`);
    }
    await getTag(req.params.id).catch(function () {
        res.status(404).render("notfound.pug");
        return
    });
    res.redirect(`/${req.params.id}`);
});

app.get("/create", checkAuth, async function(req, res) {
    if (!fs.existsSync(path.resolve(dataFolder, "tag"))) {
        fs.mkdirSync(path.resolve(dataFolder, "tag"));
    }
    createUser(req.user);
    editUser(req.user.id, "avatar", req.user.avatar);
    var exists = await coinDb.exists("coins", "snowflake", req.user.id);
    if (!exists) {
        await coinDb.insert("coins", ["snowflake", "count"], [req.user.id, getUserData(req.user.id).coins]);
    }
    await getTag(req.user.id).catch(function () {
        res.status(404).render("notfound.pug", { user: req.user });
        return;
    });
    if (!req.user.admin) {
        res.redirect(`/${req.user.id}`);
    } else {
        res.redirect(`/admin`);
    }
});

// app.get("/games", async function(req, res) {

// });

function getTag(id) {
    return new Promise(function(resolve, reject) {
        try {
            var jstring = fs.readFileSync(path.resolve(dataFolder, "users", `${id}.json`));
            var banner = new Banner(jstring);
            banner.once("done", function() {
                resolve(banner);
            });
        } catch(e) {
            console.log(e);
            reject(e);
        }
    })
}

app.get("^/:id([0-9]+)/tag.png", async function(req, res) {
    try {
        if (!fs.existsSync(path.resolve(dataFolder, "tag"))) {
            fs.mkdirSync(path.resolve(dataFolder, "tag"));
        }
        if (!fs.existsSync(path.resolve(dataFolder, "users", `${req.params.id}.json`)) || !fs.existsSync(path.resolve(dataFolder, "tag", `${req.params.id}.png`))) {
            res.status(404).render("notfound.pug");
        }
        var file = path.resolve(dataFolder, "tag", req.params.id + ".png");
        var s = fs.createReadStream(file);
        s.on('open', function () {
            res.set('Content-Type', 'image/png');
            s.pipe(res);
        });
    } catch (e) {
        res.status(404).render("notfound.pug");
    }
});

app.get("^/:id([0-9]+)/tag.max.png", async function(req, res) {
    try {
        if (!fs.existsSync(path.resolve(dataFolder, "tag"))) {
            fs.mkdirSync(path.resolve(dataFolder, "tag"));
        }
        if (!fs.existsSync(path.resolve(dataFolder, "users", `${req.params.id}.json`)) || !fs.existsSync(path.resolve(dataFolder, "tag", `${req.params.id}.max.png`))) {
            res.status(404).render("notfound.pug");
        }
        var file = path.resolve(dataFolder, "tag", req.params.id + ".max.png");
        var s = fs.createReadStream(file);
        s.on('open', function() {
            res.set('Content-Type', 'image/png');
            s.pipe(res);
        });
     } catch(e) {
         res.status(404).render("notfound.pug");
     }
});

app.get("/wii", async function(req, res) {
    var key = req.query.key || "";
    var gameID = req.query.game || "";

    if (key == "" || gameID == "") {
        res.status(400).send();
        return
    }

    var userID = await getUserID(key);
    if (userID == undefined) {
        res.status(400).send();
        return
    }

    if (getUserAttrib(userID, "lastplayed") !== null) {
        if (Math.floor(Date.now() / 1000) - getUserAttrib(userID, "lastplayed")[1] < 60) {
            res.status(429).send(); // cooldown
            return
        }
    }

    var c = getUserAttrib(userID, "coins")
    var games = getUserAttrib(userID, "games");
    var newGames = updateGameArray(games, "wii-" + gameID);
    setUserAttrib(userID, "coins", c + 1);
    setUserAttrib(userID, "games", newGames);
    setUserAttrib(userID, "lastplayed", ["wii-" + gameID, Math.floor(Date.now() / 1000)]);

    await gamePlayed(gameID, 0, req.user.id);
    res.status(200).send(gameID);

    await getTag(userID).catch(function () {
        res.status(404).render("notfound.pug");
        return
    });
});

app.get("/wiiu", async function(req, res) {
    var key = req.query.key || "";
    var gameTID = req.query.game.toUpperCase() || "";

    var ids = JSON.parse(fs.readFileSync(path.resolve(dataFolder, "ids", "wiiu.json"))) // 16 digit TID -> 4 or 6 digit game ID

    if (key == "" || gameTID == "") {
        res.status(400).send();
        return
    }

    var userID = await getUserID(key);
    if (userID == undefined) {
        res.status(400).send();
        return
    }

    if (getUserAttrib(userID, "lastplayed") !== null) {
        if (Math.floor(Date.now() / 1000) - getUserAttrib(userID, "lastplayed")[1] < 60) {
            res.status(429).send(); // cooldown
            return
        }
    }

    var c = getUserAttrib(userID, "coins")
    var games = getUserAttrib(userID, "games");
    var newGames = updateGameArray(games, "wiiu-" + ids[gameTID]);
    setUserAttrib(userID, "coins", c + 1);
    setUserAttrib(userID, "games", newGames);
    setUserAttrib(userID, "lastplayed", ["wiiu-" + gameID, Math.floor(Date.now() / 1000)]);
    res.status(200).send();

    var banner = await getTag(userID).catch(function () {
        res.status(404).render("notfound.pug");
        return
    });
});

app.get("/Wiinnertag.xml", checkAuth, async function(req, res) {
    // console.log(req.user.id);
    var userKey = await getUserKey(req.user.id);
    var tag = {
        Tag: {
            _attr: {
                URL: "http://tag.rc24.xyz/wii?game={ID6}&key={KEY}",
                Key: userKey
            }
        }
    }
    res.type("application/xml");
    res.send(xml(tag, {
        declaration: true
    }));
});


app.get("^/:id([0-9]+)", function(req, res, next) {
    // var key = req.params.id;
    // console.log(key);
    var userData = getUserData(req.params.id);
    
    if (!userData) {
        res.status(404).render("notfound.pug");
        return;
    };

    res.render("tagpage.pug", {id: req.params.id,
                               tuser: userData,
                               user: req.user,
                               flags: getFlagList(),
                               backgrounds: getBackgroundList(),
                               overlays: getOverlayList()
                              });
});

app.get("^/:id([0-9]+)/json", function(req, res) {
    var userData = getUserData(req.params.id);
    res.type("application/json");

    if (!userData) {
        res.status(404).send(JSON.stringify({error: "That user ID does not exist."}));
        return;
    };

    var lastPlayed = {};
    if (userData.lastplayed.length !== 0) {
        var banner = new Banner(JSON.stringify(userData), doMake=false);
        var game = userData.lastplayed[0];
        var time = userData.lastplayed[1];
        var gameid = game.split("-")[1]

        var consoletype = banner.getConsoleType(game);
        var covertype = banner.getCoverType(consoletype);
        var region = banner.getGameRegion(gameid);
        var extension = banner.getExtension(covertype, consoletype);

        var lastPlayed = {
            game_id: gameid,
            console: consoletype,
            region: region,
            cover_url: banner.getCoverUrl(consoletype, covertype, region, gameid, extension),
            time: time
        };
    };

    var tagUrl = `https://tag.rc24.xyz/${userData.id}/tag.png`;
    res.send(JSON.stringify({
        user: {name: userData.name, id: userData.id},
        tag_url: {normal: tagUrl, max: tagUrl.replace(".png", ".max.png")},
        game_data: {last_played: lastPlayed, games: userData.games}
    }));
});

app.get("/leaderboard/games", async function(req, res) {
    var games = await gameDb.getTableSorted("games", "count", true);
    var limit = parseInt(req.query.limit);
    if (!limit || limit > 50 || limit == "NaN") {
        limit = 10;
    }
    console.log(limit);
    res.render("gameleaderboard.pug", {
        user: req.user,
        wiiTDB: wiiTDB,
        games: games,
        limit: limit,
    });
});

app.get("/cover", async function(req, res) {

});

app.listen(port, async function() {
    // cleanCache();
    // console.log("Cleaned cache");
    await db.create("users", ["id INTEGER PRIMARY KEY", "snowflake TEXT", "key TEXT"]);
    await gameDb.create("games", ["id INTEGER PRIMARY KEY", "console INTEGER", "gameID TEXT", "count INTEGER"]);
    await coinDb.create("coins", ["id INTEGER PRIMARY KEY", "snowflake TEXT", "count INTEGER"]);
    // db.insert("users", ["snowflake", "key"], ["test_sf", "test_key"]);
    await cacheWiiTDB();
    // console.log(wiiTDB);
    console.log("RiiTag Server listening on port " + port);
});

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect("/login");
}

function checkAdmin(req, res, next) {
    if (req.isAuthenticated()) {
        if (req.user.admin) {
            return next()
        }
    }
    res.render("notfound.pug", {
        user: req.user,
    });
}

function getBackgroundList() {
    return fs.readdirSync(path.resolve(dataFolder, "img", "1200x450"));
}

function getOverlayList() {
    var overlays = [];
    fs.readdirSync(path.resolve(dataFolder, "overlays")).forEach(function(overlayFile) {
        overlays.push(JSON.parse(fs.readFileSync(path.resolve(dataFolder, "overlays", overlayFile))));
    });
    return overlays;
}

function getFlagList() {
    console.log()
    return JSON.parse(fs.readFileSync(path.resolve(dataFolder, "meta", "flags.json")));
}

function getCoinList() {
    return JSON.parse(fs.readFileSync(path.resolve(dataFolder, "meta", "coin.json")));
}

function getCoverTypes() {
    return ["cover3D", "cover", "disc"];
}

function getCoverRegions() {
    return ["EN", "FR", "DE", "ES", "IT", "NL", "PT", "AU", "SE", "DK", "NO", "FI", "TR"];
}

function getConsoles() {
    return ["wii", "wiiu", "3ds"];
}

function getFonts() {
    return JSON.parse(fs.readFileSync(path.resolve(dataFolder, "meta", "fonts.json")))
}

function editUser(id, key, value) {
    var p = path.resolve(dataFolder, "users", id + ".json");
    var jdata = JSON.parse(fs.readFileSync(p));
    jdata[key] = value;
    fs.writeFileSync(p, JSON.stringify(jdata, null, 4));
}

function getUserAttrib(id, key) {
    var p = path.resolve(dataFolder, "users", id + ".json");
    var jdata = JSON.parse(fs.readFileSync(p));
    return jdata[key] || null;
}

function setUserAttrib(id, key, value) {
    var p = path.resolve(dataFolder, "users", id + ".json");
    var jdata = JSON.parse(fs.readFileSync(p));
    jdata[key] = value;
    fs.writeFileSync(p, JSON.stringify(jdata, null, 4));
}

function getUserData(id) {
    var p = path.resolve(dataFolder, "users", id + ".json");
    try {
        var jdata = JSON.parse(fs.readFileSync(p));
    } catch(e) {
        return null;
    }
    
    return jdata;
}

async function gamePlayed(id, console, user) {
    var exists = await gameDb.exists("games", "gameID", id);
    if (!exists) {
        await gameDb.insert("games", ["console", "gameID", "count"], [console, id, 0]);
    }
    await gameDb.increment("games", "gameID", id, "count").catch(function(err) {
        process.stdout.write(err + "\n");
    });
    await coinDb.increment("coins", "snowflake", user, "count").catch(function(err) {
        process.stdout.write(err + "\n");
    });
}

async function cacheWiiTDB() {
    const url = "http://www.gametdb.com/wiitdb.txt?LANG=ORIG";
    var ret = false;
    const response = await Axios({
        url,
        method: "GET",
        responseType: "text",
    }).catch(function(err) {
        console.log(err);
        ret = true;
    });
    if (ret) {
        return;
    }
    response.data.split("\r\n").forEach(function(line) {
        try {
            var split = line.split(" = ");
            var key = split[0];
            var val = split[1];
            wiiTDB[key] = val;
        } catch(err) {
            console.log(`WiiTDB Cache: Failed on ${line}`);
            console.log(err);
        }
    });
}

async function createUser(user) {
    if (!fs.existsSync(path.resolve(dataFolder, "users", user.id + ".json"))) {
        var ujson = {
            name: user.username,
            id: user.id,
            games: [],
            lastplayed: [],
            coins: 0,
            friend_code: "0000 0000 0000 0000",
            region: "rc24",
            overlay: "overlay1.json",
            bg: "img/1200x450/riiconnect241.png",
            sort: "",
            font: "default"
        };
    
        fs.writeFileSync(path.resolve(dataFolder, "users", user.id + ".json"), JSON.stringify(ujson, null, 4));
    }

    var userKey = await getUserKey(user.id);
    if (!userKey) {
        db.insert("users", ["snowflake", "key"], [user.id, generateRandomKey(128)]);
    }
}

function generateRandomKey(keyLength) {
    const chars = "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm1234567890";
    var key = "";
    var lastChar = ""

    for (var i = 0; i < keyLength; i++) {
        var char = chars.charAt(Math.floor(Math.random() * chars.length));
        while (char == lastChar) {
            // console.log("Dupe char");
            char = chars.charAt(Math.floor(Math.random() * chars.length));
        }
        key += char;
        lastChar = char;
    }

    return key;
}

async function getUserKey(id) {
    var dbres = await db.get("users", "snowflake", id);
    if (dbres == undefined) {
        return undefined;
    } else {
        return dbres.key;
    }
}

async function getUserID(key) {
    var dbres = await db.get("users", "key", key);
    if (dbres == undefined) {
        return undefined;
    } else {
        return dbres.snowflake;
    }
}

function updateGameArray(games, game) {
    // console.log(games);
    for(var i = games.length - 1; i >= 0; i--) {
        if (games[i] == game) {
            games.splice(i, 1);
        }
    }
    games.unshift(game);
    return games;
}

function loadConfig() {
    const configFile = "config.json";
    if (!fs.existsSync(configFile)) {
        fs.copyFileSync("config.json.example", configFile);
        console.log("'config.json' has been created. Please edit the values in 'config.json' and restart the server.")
        process.exit(0);
    }
    return JSON.parse(fs.readFileSync("config.json"));
}

function getHomeTags() {
    // TODO **URGENT**: Calculate tags to show on front page
}

app.use(function(req, res, next) {
    var allowed = [
        "/img",
        "/overlays",
        "/flags"
    ];
    for (var index of allowed) {
        if (req.path.indexOf(index)) {
            console.log(req.path);
            next();
        }
    }
    res.status(404);
    res.render("notfound.pug", {
        user: req.user,
    });
});

function getGameRegion(game) { // determine the game's region by its ID
    var chars = game.split("");
    var rc = chars[3];
    if (rc == "P") {
        if (this.user.coverregion) {
            if (this.user.coverregion.toUpperCase().length == 2) { // region names are 2 characters as you can see
                return this.user.coverregion.toUpperCase();
            }
        } else {
            return "EN";
        }
    } else if (rc == "E") {
        return "US";
    } else if (rc == "J") {
        return "JA";
    } else if (rc == "K") {
        return "KO";
    } else if (rc == "W") {
        return "TW";
    } else {
        return "EN";
    }
}

function getConsoleType(game) {
    var chars = game.split("");
    var code = chars[0];
    if (game.startsWith("wii-")) {
        return "wii";
    } else if (game.startsWith("wiiu-")) {
        return "wiiu";
    } else if (game.startsWith("ds-")) {
        return "ds";
    } else if (game.startsWith("3ds-")) {
        return "3ds";
    } else if (code == "R" || code == "S") {
        return "wii";
    } else if (code == "A" || code == "B") {
        return "wiiu";
    } else {
        return "wii";
    }
}

function getExtension(covertype, consoletype) {
    if (consoletype == "wii") {
        return "png";
    } else if (consoletype != "wii" && covertype == "cover") {
        return "jpg";
    } else {
        return "png";
    }
}

function getCoverType(consoletype) {
    if (consoletype == "ds" || consoletype == "3ds") {
        return "box";
    } else if (this.user.covertype) {
        return this.user.covertype;
    } else {
        return "cover3D";
    }
}

function getCoverWidth(covertype) {
    if (covertype == "cover") {
        return 160;
    } else if (covertype == "cover3D") {
        return 176;
    } else if (covertype == "disc") {
        return 160;
    } else if (covertype == "box") {
        return 176;
    } else {
        return 176;
    }
}

function getCoverHeight(covertype, consoletype) {
    if (covertype == "cover") {
        if (consoletype == "ds" || consoletype == "3ds") {
            return 144;
        } else {
            return 224;
        }
    } else if (covertype == "cover3D") {
        return 248;
    } else if (covertype == "disc") {
        return 160;
    } else if (covertype == "box") {
        return 158;
    } else {
        return 248;
    }
}

function getCoverUrl(consoletype, covertype, region, game, extension) {
    return `https://art.gametdb.com/${consoletype}/${covertype}/${region}/${game}.${extension}`;
}

async function downloadGameCover(game, region, covertype, consoletype, extension) {
    var can = new Canvas.Canvas(this.getCoverWidth(covertype), this.getCoverHeight(covertype, consoletype));
    var con = can.getContext("2d");
    var img;

    img = await getImage(this.getCoverUrl(consoletype, covertype, region, game, extension));
    con.drawImage(img, 0, 0, this.getCoverWidth(covertype), this.getCoverHeight(covertype, consoletype));
    await savePNG(path.resolve(dataFolder, "cache", `${consoletype}-${covertype}-${game}-${region}.png`), can);
}

async function cacheGameCover(game, region, covertype, consoletype, extension) {
    if (!fs.existsSync(path.resolve(dataFolder, "cache"))) {
        fs.mkdirSync(path.resolve(dataFolder, "cache"));
    }
    if (fs.existsSync(path.resolve(dataFolder, "cache", `${consoletype}-${covertype}-${game}-${region}.png`))) {
        return true;
    }
    try {
        await this.downloadGameCover(game, region, covertype, consoletype, extension);
    } catch(e) {
        try {
            await this.downloadGameCover(game, "EN", covertype, consoletype, extension); // cover might not exist?
        } catch(e) {
            try {
                await this.downloadGameCover(game, "US", covertype, consoletype, extension); // small chance it's US region
            } catch(e) {
                return false;
            }
        }
    }
    return true;
}

module.exports = {
    dataFolder: dataFolder
}