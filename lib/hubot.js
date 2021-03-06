'use babel';

import HubotView from './hubot-view';
import { CompositeDisposable } from 'atom';

const {dialog} = require('electron').remote;
require('coffee-script/register');
var Hubot = require('hubot');
var Log = require('log')
var Path = require('path');
var fs = require('fs');
var robot = undefined;
var user = undefined;
//const play_scripts = "play.coffee";
var defaultScriptsPath = Path.resolve(__dirname, "../scripts");
var userAvatar = Path.resolve(__dirname, "../octocat.png");
var hubotAvatar = Path.resolve(__dirname, "../hubot.png");
var hubotOutputWindow = undefined;
var scriptsPathLink = undefined;
var $ = require('jquery');
const TextMessage = Hubot.TextMessage;
var userScriptsPath = Path.resolve(__dirname, "../");
var fullUserScriptsPath = Path.resolve(userScriptsPath, "play.coffee");
var historySize = 10;
var historyPath = Path.resolve(__dirname, "../logs/.hubot_history");
var historyIndex = 0;
var chokidar = require('chokidar');

var watcher = chokidar.watch(fullUserScriptsPath, {
  persistent: true
});

var history = [];

fs.readFile(historyPath, 'utf8', function (err,data) {
  if (err) {
    return console.log(err);
  }

  history = data.toString().split("\r\n");
  if (history[history.length - 1] === "") {
    history.splice(history.length - 1, 1);
  }

  historyIndex = history.length;
});

const updateWindowWithHubotMessage = (response, isEmote) => {

  if (typeof isEmote === 'undefined') { isEmote = false; }

  response = response.trim();

  // only supporting single media responses right now
  if (response.endsWith(".jpg") || response.endsWith(".gif") || response.endsWith(".png")) {
    hubotOutputWindow.append("<div class='output-row'><div class='hubot-avatar'><img src='" + hubotAvatar + "'/></div><div class='hubot-message'><img src='" + response + "'/></div></div>");
  } else if (response.includes('Shell:')) {
    response = response.replace("Shell:", "@octocat:");
    hubotOutputWindow.append("<div class='output-row'><div class='hubot-avatar'><img src='" + hubotAvatar + "'/></div><div class='hubot-message'>" + response + "</div></div>");
  }
  else {
    if (isEmote) {
      hubotOutputWindow.append("<div class='output-row'><div class='hubot-avatar'><img src='" + hubotAvatar + "'/></div><div class='hubot-message'><i>" + response + "</i></div></div>");
    } else {
      hubotOutputWindow.append("<div class='output-row'><div class='hubot-avatar'><img src='" + hubotAvatar + "'/></div><div class='hubot-message'>" + response + "</div></div>");
    }
  }

  scrollDown();

};

function startWatchingUserScript() {

  // by default watching scripts at atomhubot/play.coffee
  watcher.on('change', path => {
    console.log(`File ${path} has been changed`);

    // looks like hubot is an all or nothing reload of scripts
    // TODO: investigate if there's a way to only remove one script
    reloadAllScripts();
  });

}

var loadInstalledScripts = function() {

  var rulesScriptPath = Path.resolve(__dirname, "../node_modules/hubot-rules/src")
  robot.load(rulesScriptPath);

  var pugmeScriptPath = Path.resolve(__dirname, "../node_modules/hubot-pugme/src")
  robot.load(pugmeScriptPath);

  robot.load(defaultScriptsPath);

};

// because hubot won't put up with code that doesn't work!
// he throws a literal fit by calling process.exit(1)
// https://github.com/github/hubot/blob/master/src/robot.coffee#L365
function loadPlayScript() {

  try {

    var coffeescript = require("coffee-script");
    console.log("Full file path: " + fullUserScriptsPath);
    var source = fs.readFileSync(fullUserScriptsPath, "utf8");

    coffeescript.compile(source);

    var myscript = require(fullUserScriptsPath);

    // note: this loads the actual script
    myscript(robot);

    $('#script-error').hide();

  }
  catch(error) {
    $('#script-error').show();
    console.log("Caught an exception: Unable to load " + fullUserScriptsPath + ": " + error.stack);
  }
}

function deleteHubotScriptCache() {
  robot.commands = [];
  robot.listeners = [];

  // when reloading, let's delete only the file we're allowing the user to
  // modify to keep the deleteScriptCache function simple
  // loading the same npm-installed scripts multiple times (e.g. hubot-rules)
  // doesn't seem to have any negative effects
  var scriptToDelete = fullUserScriptsPath;
  deleteScriptCache(scriptToDelete);
}

function deleteScriptCache(scriptToDelete) {

  // https://github.com/vinta/hubot-reload-scripts/blob/master/src/reload-scripts.coffee
  if (fs.existsSync(scriptToDelete)) {

    if (require.cache[require.resolve(scriptToDelete)]) {
      try {
        var cacheobj = require.resolve(scriptToDelete);
        delete(require.cache[cacheobj]);
      }
      catch(error) {
        console.log("Unable to invalidate #{cacheobj}: #{error.stack}");
      }
    }
  }

  updateWindowWithHubotMessage("done refreshing scripts!", true);
};

var reloadAllScripts = function() {

  // first clear hubot of all his scripts
  deleteHubotScriptCache();

  // attempt to load the play script. it'll either work or throw exception
  loadPlayScript();

  // lastly install all the installed scripts which are by default valid
  // unless modified outside of this package
  loadInstalledScripts();
};

const updateWindowWithUserMessage = (request) => {
  hubotOutputWindow.append("<div class='output-row'><div class='user-avatar'><img src='" + userAvatar + "'/></div><div class='user-message'>" + request + "</div></div>");
  scrollDown();
};

function scrollDown() {
  // to keep the latest output visible
  hubotOutputWindow.stop().animate({
    scrollTop: hubotOutputWindow[0].scrollHeight
  }, 200);
}

export default {

  hubotView: null,
  modalPanel: null,
  subscriptions: null,

  activate(state) {
    this.hubotView = new HubotView(state.hubotViewState);
    this.hubotView.setController(this);

    this.modalPanel = atom.workspace.addRightPanel({
      item: this.hubotView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'hubot:toggle': () => this.toggle()
    }));

    this.hubotView.detectEnterPress();
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.hubotView.destroy();

  },

  serialize() {
    return {
      hubotViewState: this.hubotView.serialize()
    };
  },

  toggle() {
    console.log('Hubot was toggled again!');
    var isVisible = this.modalPanel.isVisible();

    if (isVisible) {
      this.modalPanel.hide();

    } else {
      this.modalPanel.show();

      try {

          robot = Hubot.loadBot(undefined, "electron", false, "Hubot", false);

          var stream = fs.createWriteStream(__dirname + '/../logs/hubot.log');
          robot.logger = new Log('debug', stream);

          robot.adapter.wireUpResponses(updateWindowWithHubotMessage);
          user = robot.brain.userForId(1, 'atom', 'Shell');
          console.log('hubot loaded');

          // wire up the buttons
          hubotOutputWindow = $('#hubot-output');
          scriptsPathLink = $('#scripts-link');

          // setup the watcher on the play.coffee
          startWatchingUserScript();

          reloadAllScripts();

          // update UI
          scriptsPathLink.text(fullUserScriptsPath);
          updateWindowWithHubotMessage("I'm ready!");

      } catch(ex) {
          console.error("Error trying to initialize hubot: " + ex);
      }
    }

    return isVisible;
  },

  sendRequest() {

  // update the window first
    var request = $('#hubot-input').val();
    updateWindowWithUserMessage(request);

    // clear input window for next command
    $('#hubot-input').val('');

    // if we immediately request, hubot comes back instantly
    // need a bit of a delay to get that back-and-forth chat feeling
    setTimeout(function() {

      // send request to hubot
      console.log("sending ", request);
      console.log("here we go...");
      var user = robot.brain.userForId(1, 'octocat', 'Shell');

      // if request starts with a '.', substitute 'hubot' instead
      if (request.startsWith(".")) {
        request = request.replace(".", " hubot ");
      }

      robot.receive(new TextMessage(user, request, 'messageId'));

    }, 750);

    // log history - even if invalid command
    history.push(request + "\r\n");

    // users will expect to loop within last x commands within same session
    if (history.length > historySize) {
      var startIndex = (history.length - historySize);
      history = history.splice(startIndex, historySize);
      console.log("new history:" + history);
    }

    var historyStream = fs.createWriteStream(historyPath);

    // convert from array back to string to log
    var newHistory = "";
    for (let str of history) {
      if (str === "") {
        continue;
      }

      if (!(str.endsWith("\r\n"))) {
        str += "\r\n";
      }

      newHistory += str;
  //        console.log("newHistory: " + newHistory);
    }

    historyStream.write(newHistory);
    historyIndex = history.length;
  },

  getPrevCommand() {
    historyIndex--;
    if (historyIndex < 0) {
      historyIndex = history.length - 1;
    }

    if (history.length > 0) {
      var cmd = history[historyIndex];
      $('#hubot-input').val(cmd);
    }
  },

  getNextCommand() {
    historyIndex++;
    if (historyIndex > history.length - 1) {
      historyIndex = 0;
    }

    if (history.length > 0) {
      var cmd = history[historyIndex];
      $('#hubot-input').val(cmd);
    }
  }

};
