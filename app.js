const Banner = require("./src/index"),
      fs = require("fs");
      
const cacheManager = require("./src/cache-manager");
const dataManager = require("./src/data-manager");
const userManager = require("./src/user-manager");

const passport = require("passport"),
      session = require("express-session"),
      bodyParser = require("body-parser")
      DiscordStrategy = require("passport-discord").Strategy;
      xml = require("xml");
      crenderMiiFromHex = require("./src/rendermiifromhex"),
      crypto = require("crypto");

const Sentry = require('@sentry/node'),
      express = require("express");
const UserManager = require("./src/user-manager");

const json_string = fs.readFileSync(dataManager.build("debug", "user1.json")),
      config = initalizeConfig();

const app = express();

const guests = {"a": "Guest A","b": "Guest B","c": "Guest C","d": "Guest D","e": "Guest E","f": "Guest F"};
const guestList = Object.keys(guests);
guestList.push("undefined");

const port = config.port || 3000;

Sentry.init({ dsn: config.sentryURL });

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
app.set("view-engine", "pug");

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});


const DatabaseDriver = require("./dbdriver");
//const db = new DatabaseDriver(dataManager.build("users.db"));

var scopes = ['identify'];

passport.use(new DiscordStrategy({
    clientID: config.clientID,
    clientSecret: config.clientSecret,
    callbackURL: config.hostURL.replace("{{port}}", port) + "callback"
    }, (accessToken, refreshToken, profile, done) => {
        return done(null, profile);
}));

app.use(session({
    secret: generateRandomKey(512),
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public/"));
app.use(express.static("data/"));
app.set("view engine", "pug");

app.get("/", (req, res) => {
    res.render("index.pug", { user: req.user });
});

app.get("/demo", async (req, res) => {
    var banner = await new Banner(json_string);
    banner.once("done", () => {
        banner.pngStream.pipe(res);
    });
});

app.get('/login', (req, res, next) => {
    if (req.isAuthenticated())
        res.redirect("/");

    next()
}, passport.authenticate('discord', { scope: scopes }));

app.get('/logout', (req, res) => {
    req.logout();
    res.redirect("/")
});

app.get('/callback',
    passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => { 
        res.cookie("uid", req.user.id);
        req.user.admin = config.admins.includes(req.user.id);
        res.redirect("/create") ;
    } // auth success
);

app.route("/edit")
    .get(checkAuth, async (req, res)=>{
        var userJson,
            userKey = await userManager.getKey(req.user.id);
            
        userJson = String(fs.readFileSync(dataManager.build("users", `${req.user.id}.json`)));
            
        if (!userKey) {
            console.log("User Key is undefined");
            return res.redirect("/create");
        }

        res.render("edit.pug", 
        {jstring: userJson,
            backgrounds: dataManager.getBackgrounds(),
            jdata: JSON.parse(userJson),
            overlays: dataManager.getOverlays(),
            flags: dataManager.getFlags(),
            coins: dataManager.getCoins(),
            covertypes: dataManager.getCoverTypes(),
            coverregions: dataManager.getRegions(),
            fonts: dataManager.getFonts(),
            userKey,
            user: req.user
        });
    })
    .post(checkAuth, async (req, res) => {
        userManager.edit(req.user.id, {
            bg: req.body.background,
            overlay: req.body.overlay,
            region: req.body.flag,
            coin: req.body.coin,
            name: req.body.name,
            friend_code: req.body.wiinumber,
            games: req.body.games.split(";"),
            covertype: req.body.covertype,
            useavatar: req.body.useravatar,
            usemii: req.body.usemii,
            font: req.body.font,
            mii_data: req.body.miidata
        });

        if (!guestList.includes(req.body.miidata)) {
            await renderMiiFromHex(req.body.miidata, req.user.id, dataFolder).catch(() => {
                console.log("Failed to render mii");
            });
        }

        await getTag(req.user.id).catch(() => {
            return res.status(404).render("notfound.pug");
        });

        res.redirect(`/${req.user.id}`);

        getTag(req.user.id);

    });


app.get("/create", checkAuth, async (req, res) => {
    if (!fs.existsSync(dataManager.build("tag")))
        fs.mkdirSync(dataManager.build("tag"));

    userManager.create(req.user, generateRandomKey());
    userManager.edit(req.user.id, { "avatar": req.user.avatar });

    var banner = await getTag(req.user.id).catch(() => {
        res.status(404).render("notfound.pug");
        return
    });

    res.redirect(req.user.admin ? "/admin" : `/${req.user.id}`);
});

function getTag(id) {
    return new Promise((resolve, reject) => {
        var banner = new Banner(fs.readFileSync(dataManager.build("users", `${id}.json`)));
        banner.once("done", () => {resolve(banner);});
    })
}


app.get("^/:id([0-9]+)/tag.png", async (req, res) => {
    try {
        if (!fs.existsSync(dataManager.build("tag")))
            fs.mkdirSync(dataManager.build("tag"));

        if (!fs.existsSync(dataManager.build("users", `${req.params.id}.json`)) || !fs.existsSync(dataManager.build("tag", `${req.params.id}.png`)))
            res.status(404).render("notfound.pug");

        var file = dataManager.build("tag", `${req.params.id}.png`);
        var s = fs.createReadStream(file);

        s.on('open', () => {
            res.set('Content-Type', 'image/png');
            s.pipe(res);
        });
    } catch (e) {
        res.status(404).render("notfound.pug");
    }
});

/**
 * Take a supplied user object, and increment the total coin number. Add a new game if it isn't currently present.
 * @param {User} user 
 */
async function incrementUserCoins(res, key, gameID, wiiu=false, ids=null) {
    var userID = await userManager.getID(key);

    if (!userID)
        return res.status(400).send();

    if (userManager.getAttribute(userID, "lastplayed")) {
        if (Math.floor(Date.now() / 1000) - userManager.getAttribute(userID, "lastplayed")[1] < 60)
            return res.status(429).send(); // cooldown
    }

    var coins = userManager.getAttribute(userID, "coins"),
        games = userManager.getAttribute(userID, "games"),
        newGames = updateGameArray(games, !wiiu?`wii-${gameID}`:`wiiu-${ids[gameTID]}`);

    userManager.edit(userID, {
        coins: coins + 1,
        games: newGames,
        lastPlayed: [`wii-${gameID}`, Math.floor(Date.now() / 1000)]
    });
    
    await getTag(userID).catch(() => {
        return res.status(404).render("notfound.pug");
    });

    res.status(200).send();
}

app.get("/wii", async (req, res) => {
    var key = req.query.key || "",
        gameID = req.query.game || "";

    if (key == "" || gameID == "")
        return res.status(400);

    incrementUserCoins(res, key, gameID);
})
.get("/wiiu", async (req, res) => {
    var key = req.query.key || "";
    var gameTID = req.query.game.toUpperCase() || "";

    var ids = JSON.parse(fs.readFileSync(dataManager.build("ids", "wiiu.json"))) // 16 digit TID -> 4 or 6 digit game ID

    if (key == "" || gameTID == "")
        return res.status(400);

    incrementUserCoins(res, key, "", true, ids);
});

app.get("/Wiinnertag.xml", checkAuth, async (req, res) => {
    var userKey = await getUserKey(req.user.id),
    tag = {
        Tag: {
            _attr: {
                URL: "http://tag.rc24.xyz/wii?game={ID6}&key={KEY}",
                Key: userKey
            }
        }
    }
    res.type("application/xml");
    res.send(xml(tag, {declaration: true}));
});


app.get("^/:id([0-9]+)", (req, res, next) => {
    var userData = userManager.get(req.params.id);
    
    if (!userData)
        return res.status(404).render("notfound.pug");

    res.render("tagpage.pug", {id: req.params.id,
                               tuser: userData,
                               user: req.user,
                               flags: dataManager.getFlags(),
                               backgrounds: dataManager.getBackgrounds(),
                               overlays: dataManager.getOverlays()
                              });
});

// Receive user JSON
app.get("^/:id([0-9]+)/json", (req, res) => {
    let userData = getUserData(req.params.id);
    res.type("application/json");

    if (!userData)
        return res.status(404).send(JSON.stringify({error: "That user ID does not exist."}));

    var lastPlayed = {};

    if (userData.lastplayed.length !== 0) {
        let banner = new Banner(JSON.stringify(userData), doMake=false),
            game = userData.lastplayed[0],
            time = userData.lastplayed[1],
            gameid = game.split("-")[1],
            consoletype = banner.getConsoleType(game),
            covertype = banner.getCoverType(consoletype),
            region = banner.getGameRegion(gameid),
            extension = banner.getExtension(covertype, consoletype);

        lastPlayed = {
            game_id: gameid,
            console: consoletype,
            region: region,
            cover_url: banner.getCoverUrl(consoletype, covertype, region, gameid, extension),
            time: time
        };
    };

    let tagUrl = `https://tag.rc24.xyz/${userData.id}/tag.png`;

    res.send({
        user: {name: userData.name, id: userData.id},
        tag_url: {normal: tagUrl},
        game_data: {last_played: lastPlayed, games: userData.games}
    });
});

app.get("/admin", checkAdmin, (req, res) => {
    res.render("admin.pug", { user: req.user });
});

app.get("^/admin/refresh/:id([0-9]+)", checkAdmin, async (req, res) => {
    if (!req.params.id) res.redirect(`/${req.user.id}`);

    // return is required in the one liner to keep express from trying to redirect the user after the rendering of the page
    await getTag(req.params.id).catch(() => {res.status(404).render("notfound.pug"); return;});
    
    res.redirect(`/${req.params.id}`);
});

app.listen(port, async () => {
    // await db.create("users", ["id INTEGER PRIMARY KEY", "snowflake TEXT", "key TEXT"]);
    // await db.create("games", ["id INTEGER PRIMARY KEY", "console INTEGER", "gameID TEXT", "count INTEGER"]);
    // await db.create("coins", ["id INTEGER PRIMARY KEY", "snowflake TEXT", "count INTEGER"]);
    console.log("RiiTag Server listening on port " + port);
});

function checkAuth(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect("/login");
}

/**
 * Generate an ACTUALLY SECURE FUCKING KEY.
 */
function generateRandomKey() {
    return crypto.createHash('sha1').digest("hex");
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

function updateGameArray(games, game) {
    for(var i = games.length - 1; i >= 0; i--) {
        if (games[i] == game) {
            games.splice(i, 1);
        }
    }
    games.unshift(game);
    return games;
}

function initalizeConfig() {
    if (fs.existsSync("config.json"))
        return JSON.parse(fs.readFileSync("config.json"));

    fs.copyFileSync("config.example.json", "config.json");
    console.log("'config.json' has been created. Please edit the values in 'config.json' and restart the server.")

    process.exit(0);
}

app.use((req, res, next) => {
    var allowed = [
        "/img",
        "/overlays",
        "/flags"
    ];
    allowed.forEach((directory) => {
        if (req.path.indexOf(directory)) {
            next();
        }
    });
    res.status(404);
    res.render("notfound.pug");
});