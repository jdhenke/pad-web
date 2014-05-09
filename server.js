// web server for pad on heroku

// bring in dependencies
var http = require("http"),
    url  = require("url"),
    path = require("path"),
    fs   = require("fs"),
    git  = require("./js/git.js");

// allow an "infinite" number of connections
http.globalAgent.maxSockets = Infinity;

var masterHostname = process.argv[2];
var masterPort = process.argv[3];
var myPort = parseInt(process.argv[4]);

// "cache" webpage contents
var index = fs.readFileSync("index.html");

// magic numbers
var errorTimeout = 1000;

// internal state
var docs = {};

// main handler
http.createServer(function(req, res) {
  var uri = url.parse(req.url).pathname;
  if (uri.match(/docs/)) {
    res.writeHead(200, {"Content-Type": "text/html"});
    res.end(index);
  } else if (uri.match(/get/)) {
    var docID = req.headers["doc-id"];
    var commitID = parseInt(req.headers["next-commit"]);
    get(docID, commitID, res);
  } else if (uri.match(/put/)) {
    var docID = req.headers["doc-id"];
    readAll(req, function(data) {
      put(docID, data, res);
      res.end();
    });
  } else if (uri.match(/js/)) {
    var filename = path.join(process.cwd(), uri);
    fs.readFile(filename, "utf-8", function(err, file) {
      if(err) {
        res.writeHead(500, {"Content-Type": "text/plain"});
        res.write(err + "\n");
        res.end();
        return;
      }
      res.writeHead(200);
      res.write(file, "utf-8");
      res.end();
    });
  } else if (uri.match(/init/)) {
    var docID = req.headers["doc-id"];
    init(docID, res);
  } else {
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.write("404 Not Found\n");
    res.end();
  }
}).listen(myPort);

var slot = 0;
(function pullFromMaster() {
  var options = {
    hostname: masterHostname,
    port: masterPort,
    path: "/get",
    method: 'GET',
    headers: {
      "slot": slot,
    },
  };
  http.get(options, function(res) {
    if (res.statusCode == 200) {
      readAll(res, function(data) {
        slot += 1;
        var commit = JSON.parse(data);
        var doc = getDoc(commit.docID);
        for (var i = commit.parent + 1; i < doc.commits.length; i += 1) {
          commit.diff = git.rebase(doc.commits[i].diff, commit.diff);
        }
        commit.parent = doc.commits.length - 1;
        doc.commits.push(commit);
        doc.state = git.applyDiff(doc.state, commit.diff);
        var listenersIndex = doc.commits.length - 1;
        var listeners = doc.listeners[listenersIndex] || [];
        listeners.forEach(function(waitingRes) {
          waitingRes.end(JSON.stringify(commit));
        });
        delete doc.listeners[listenersIndex];
        pullFromMaster();
      });
    } else {
      setTimeout(pullFromMaster, errorTimeout);
    }
  }).on("error", function(err) {
    console.log("get error", err);
    setTimeout(pullFromMaster, errorTimeout);
  });
})();

function get(docID, commitID, res) {
  var doc = getDoc(docID);
  if (commitID < doc.commits.length) {
    res.end(JSON.stringify(doc.commits[commitID]));
  } else {
    doc.listeners[commitID] = doc.listeners[commitID] || [];
    doc.listeners[commitID].push(res);
  }
}

function put(docID, data) {
  var options = {
    hostname: masterHostname,
    port: masterPort,
    path: "/put",
    method: 'PUT',
  };
  var req = http.request(options);
  req.on("error", function(err) {
    console.log("put error", err);
    setTimeout(function() {
      put(docID, data)
    }, errorTimeout);
  });
  req.write(data);
  req.end();
}

function init(docID, res) {
  var doc = getDoc(docID);
  res.writeHead(200, {"head": doc.commits.length - 1});
  res.end(JSON.stringify(doc.state));
}

function getDoc(docID) {
  var docID = "" + docID;
  if (!(docID in docs)) {
    docs[docID] = {
      commits: [null],
      listeners: {},
      state: "",
    };
  }
  return docs[docID];
}

function readAll(res, callback) {
  var data = "";
  res.on("data", function(chunk) {
    data += chunk;
  });
  res.on("end", function() {
    callback(data);
  });
}
