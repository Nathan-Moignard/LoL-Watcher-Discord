import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { Client, Intents } from "discord.js"
import Axios from "axios"

import 'dotenv/config'
import { config } from 'process'

const NEWS_CHANNEL_ID = 953454388205191208;

let Db = undefined;

async function openDb() {
    const db = await open({
        filename: 'database.db',
        driver: sqlite3.Database
    })
    if (db !== undefined) {
        console.info("DB Successfully loaded")
    }
    return db;
}

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })


async function addUser(user) {
    getPuuid(user);
    Db.run(`INSERT INTO Users (puuid) VALUES ('${user}');`)
}

client.on("messageCreate", (message) => {
    if (message.content.startsWith('?stalk ')) {
        const user = message.content.substring('?stalk '.length);

        addUser(user);
        message.reply("User " + user + " successfully added !");
    }
    console.log(message.content);
});

async function checkUserTable() {
    try {
        console.log("check");
        await Db.run("SELECT * FROM Users;");
    } catch (e) {
        console.log("create");
        Db.run(`CREATE TABLE Users (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            puuid TINYTEXT
        );`);
    }
}

async function getPuuid(user) {
    const userInfo = user.split('#')
    const res = await Axios.get('https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' + userInfo[0] + '/' + userInfo[1],
    {
        headers: {
            "X-Riot-Token": process.env.RIOT_API_KEY
        }
    })
    console.log(res.data);
}

client.on("ready", () => {
    setInterval(async () => {
        await checkUserTable();
    }, 1000);
});

async function start() {
    Db = await openDb();
    if (Db === undefined)
        return;
    client.login(process.env.DISCORD_API_KEY);
}

start()
