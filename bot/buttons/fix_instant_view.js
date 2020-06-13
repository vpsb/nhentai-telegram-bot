const nhentai = require("nhentai-js");
const moment = require("moment");
const { uploadByUrl } = require("telegraph-uploader");

const { telegraphCreatePage } = require("../telegraph.js");
const { doujinExists, getDoujin, getMangaMessage } = require("../someFuncs.js");

const db = require("../../db/dbhandler.js");

module.exports.fixInstantView = async function(ctx) {
  let query_data = ctx.update.callback_query.data,
    manga_id = query_data.split("_")[1];
  if(!manga_id){
    return
  }
    let manga = await getDoujin(manga_id);
  if (!manga) {
    return;
  }
  let botLoadStatus = await db.getBotStage(),
      dbMangaRecord = await db.getManga(manga_id);
  console.log(botLoadStatus.doujinsFixing + ' enter')
  for (let i = 0; botLoadStatus.doujinsFixing > 3; i++) {
    console.log(botLoadStatus.doujinsFixing + ' loop ' + i)
    let messageText;
    if (i % 2 == 0) {
      messageText = "wait a bit.";
    } else if (i % 3 == 0) {
      messageText = "wait a bit...";
    } else {
      messageText = "wait a bit..";
    }

    await ctx
      .editMessageReplyMarkup({
        inline_keyboard: [
          [
            { text: messageText, callback_data: "wait" },

            {
              text: "Telegra.ph",
              url: dbMangaRecord.telegraphUrl
            }
          ]
        ]
      })
      .catch(err => {
        console.log(err);
      });

    botLoadStatus = await db.getBotStage();
    await sleep(2000);
  }
  await db.updateBotStage("doujinsFixing", botLoadStatus.doujinsFixing+1)
  let messageText = getMangaMessage(manga, dbMangaRecord.telegraphUrl);

  await ctx
    .editMessageReplyMarkup({
      inline_keyboard: [
        [
          { text: "Wait ", callback_data: "wait" },

          {
            text: "Telegra.ph",
            url: dbMangaRecord.telegraphUrl
          }
        ]
      ]
    })
    .catch(err => {
      console.log(err);
    });
  let start_time = moment();
  console.log("start uploading doujin");
  let pages = manga.pages,
    telegrapf_urls = [],
    attempts_counter = 0;
  // uploading images
  for (let i = 0; i < pages.length; i++) {
    if (attempts_counter > 10) {
      await ctx
        .editMessageReplyMarkup({
          inline_keyboard: [
            [
              { text: "try again later :(", callback_data: "tryLater_" + manga.id },
              {
                text: "Telegra.ph",
                url: dbMangaRecord.telegraphUrl
              }
            ]
          ]
        })
        .catch(err => {
          console.log(err);
        });
      return;
    }
    await uploadByUrl(pages[i])
      .then(result => {
        telegrapf_urls.push(result.link);
      })
      .catch(async err => {
        i -= 1;
        console.log(
          "err in uploading image heppened on try number " + attempts_counter
        );
        attempts_counter += 1;
      });
    await ctx
      .editMessageReplyMarkup({
        inline_keyboard: [
          [
            {
              text: i + 1 + "/" + pages.length + " pages fixed",
              callback_data: "fixing"
            },
            {
              text: "Telegra.ph",
              url: dbMangaRecord.telegraphUrl
            }
          ]
        ]
      })
      .catch(err => {
        console.log(err);
      });
  }
  console.log("finish uploading images");
  let newPage = await telegraphCreatePage(manga, telegrapf_urls);
  if (newPage.url) {
    console.log("page created");
  } else {
    console.log("page was NOT created");
    return;
  }
  let finish_time = moment(),
    difference_format = manga.details.pages[0] < 20 ? "seconds" : "minutes",
    difference = finish_time.diff(start_time),
    difference_division = difference > 60000 ? 1000 : 60000;
  console.log(
    `it took ${difference / difference_division} ${difference_format}`
  );
  await db.updateManga(manga_id, newPage.url);
  await db.updateBotStage("doujinsFixing", botLoadStatus.doujinsFixing-1)
  messageText = getMangaMessage(manga, newPage.url);
  let inline_keyboard = [
    [
      {
        text: "Telegra.ph",
        url: newPage.url
      }
    ]
  ];
  if (!ctx.update.callback_query.message) {
    await ctx
      .editMessageText(messageText, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: inline_keyboard
        }
      })
      .catch(err => {
        console.log(err);
      });
  } else {
    inline_keyboard.push([
      { text: "Search", switch_inline_query_current_chat: "" }
    ]);
    inline_keyboard.push([
      { text: "Next", callback_data: "r_prev" + manga.id }
    ]);
    await ctx
      .editMessageText(messageText, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: inline_keyboard
        }
      })
      .catch(err => {
        console.log(err);
      });
  }
};
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
