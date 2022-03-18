import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { Client, Intents } from "discord.js"
import Axios from "axios"
import moment from 'moment'
import 'dotenv/config'

const RIOT_AUTH_HEADER = {
    headers: {
        "X-Riot-Token": process.env.RIOT_API_KEY
    }
}

const NEWS_CHANNEL_ID = '953454388205191208';

let Db = undefined;

async function openDb() {
    const db = await open({
        filename: 'db/database.db',
        driver: sqlite3.Database
    })
    if (db !== undefined) {
        console.info("DB Successfully loaded")
    }
    return db;
}

const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] })

function sendChannelMessage(channelId, message) {
    const channel = client.channels.cache.get(channelId);

    console.info(message);
    channel.send(message);
}

async function addUser(userInfo) {
    Db.run(`INSERT INTO Users (username, puuid) VALUES ('${userInfo.name}', '${userInfo.puuid}');`)
}

client.on("messageCreate", async (message) => {
    if (message.content.startsWith('?stalk ')) {
        const user = message.content.substring('?stalk '.length);
        const userInfo = await getSumonnerInfo(user);

        if (userInfo.puuid === undefined) {
            message.reply('User not found !')
        } else {
            addUser(userInfo);
            message.reply("User " + user + " successfully added !");
        }
    }
});

async function checkTableAvailability(tableName, schema) {
    try {
        await Db.run(`SELECT * FROM ${tableName};`);
    } catch (e) {
        console.info("Creating TABLE " + tableName);
        Db.run(`CREATE TABLE ${tableName} ${schema};`);
    }
}

async function getSumonnerInfo(user) {
    try {
        const res = await Axios.get('https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-name/' + user,
            RIOT_AUTH_HEADER)
        return res.data;
    } catch (e) {
        if (Axios.isAxiosError(e) && e.response.data.status.status_code === 404) {
            return undefined;
        }
    }
}

async function getUsers() {
    try {
        const res = await Db.all("SELECT * FROM Users;");
        return res;
    } catch (e) {
        console.error(e);
        return undefined;
    }
}

async function getUserMatchInfo(matchId, userPuuid) {
    try {
        const res = await Axios.get('https://europe.api.riotgames.com/lol/match/v5/matches/' + matchId,
            RIOT_AUTH_HEADER);

        for (const participant of res.data.info.participants) {
            if (participant.puuid === userPuuid) {
                return [res.data, participant];
            }
        }
    } catch (e) {
        console.error(e);
    }
}

async function getMatches(puuid) {
    try {
        const res = await Axios.get('https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/' + puuid + '/ids?start=0&count=5',
            RIOT_AUTH_HEADER);
        return res.data;
    } catch (e) {
        if (Axios.isAxiosError(e)) {
            console.error(e.response.data);
            return undefined;
        }
    }
}

// async function checkUserVictory(matchId, puuid) {
//     try {
//         const res = await getMatchInfo(matchId, puuid);

//         for (const participant of res.info.participants) {
//             if (participant.puuid === puuid) {
//                 console.log(participant.win);
//             }
//         }
//     } catch (e) {
//         console.error(e);
//     }
// }

async function doesMatchExist(matchId) {
    try {
        const res = await Db.get(`SELECT matchId FROM Matches WHERE matchId = '${matchId}'`);

        return res !== undefined
    } catch (e) {
        console.error(e);
    }
}

async function checkNewGames() {
    const users = await getUsers();

    if (users === undefined)
        return;

    for (const user of users) {
        const matches = await getMatches(user.puuid);

        for (const matchId of matches) {
            const [gameInfo, userGameInfo] = await getUserMatchInfo(matchId, user.puuid);

            if (await doesMatchExist(matchId) === false) {
                const humanTime = moment.unix(gameInfo.info.gameCreation / 1000).format('dddd, MMMM Do, YYYY h:mm:ss A');
                const victoryStatus = userGameInfo.win === true
                ? "Victory :trophy:"
                : "Defeat :salt:"

                sendChannelMessage(NEWS_CHANNEL_ID,
                    `**New Game from ${user.username}:**\n- ${humanTime}\n- ${victoryStatus}`);

                await Db.run(`INSERT INTO Matches 
                (matchId, win, time, userPuuid) VALUES 
                ('${matchId}', ${userGameInfo.win}, ${gameInfo.info.gameCreation}, '${user.puuid}');`)
            }
        }
    }
}

client.on("ready", () => {
    setInterval(async () => {
        await checkTableAvailability('Users', `(
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TINYTEXT,
            puuid TINYTEXT
        )`);
        await checkTableAvailability('Matches', `(
            matchId TINYTEXT,
            win BOOLEAN,
            time DATETIME,
            userPuuid INTEGER REFERENCES Users (Id)
        )`);
        await checkNewGames();
    }, 10000);
});

async function start() {
    Db = await openDb();
    if (Db === undefined)
        return;
    client.login(process.env.DISCORD_API_KEY);
}

start()
