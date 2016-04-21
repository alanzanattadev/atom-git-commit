'use babel'

var GitCommitView = require('./git-commit-view');
var {CompositeDisposable} = require('atom');
var React = require('react');
var ReactDOM = require('react-dom');
var CommitManagerView = require('./components/CommitManagerView.jsx');
var {exec} = require('child_process');

module.exports = GitCommit = {
  gitCommitView: null,
  modalPanel: null,
  subscriptions: null,

  activate: function(state) {
    this.gitCommitView = new GitCommitView(state.gitCommitViewState);
    this.gitCommitViewElement = this.gitCommitView.getElement();
    this.gitCommitViewElement.onkeydown = (e) => {
      var ctrlDown = e.ctrlKey || e.metaKey;
      if (e.which == 27) { // esc
        this.toggle();
      } else if (e.which == 13) { //enter
        this.toggle();
        this.save();
      }
    };
    this.modalPanel = atom.workspace.addModalPanel({item: this.gitCommitViewElement, visible: false});
    this.rootComponent = ReactDOM.render((<CommitManagerView/>), this.gitCommitViewElement);
    //Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable()

    //Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {'git-commit:commit': () => { this.toggle() }}));
  },

  deactivate: function() {
    this.modalPanel.destroy()
    this.subscriptions.dispose()
    this.gitCommitView.destroy()
  },

  consumeToolBar: function(toolBar) {
    this.toolBar = toolBar('git-commit');

    // Adding spacer
    this.toolBar.addSpacer();

    // Using custom icon set (Ionicons)
    var commitButton = this.toolBar.addButton({
      icon: 'stagecommit',
      callback: 'git-commit:commit',
      tooltip: 'Commit',
      iconset: 'icon-git',
    });

    // Adding spacer
    this.toolBar.addSpacer();

    this.toolBar.onDidDestroy = function() {
      this.toolBar = null;
    };
  },

  serialize: function() {
    return {gitCommitViewState: this.gitCommitView.serialize()};
  },
  getRepoPath: function() {
    let parentFolders = [];
    let parentFolder = atom.workspace.getActivePaneItem().buffer.file.getParent();
    while (parentFolder.getBaseName() != "") {
      parentFolders.push(parentFolder);
      parentFolder = parentFolder.getParent();
    }
    let existsPromises = parentFolders.map((path) => new Promise((resolve, reject) => {
      path.getSubdirectory(".git").exists().then((subdirectoryExists) => {
        resolve(subdirectoryExists);
      });
    }));
    return Promise.all(existsPromises).then((results) => {
      return parentFolders[results.findIndex((exists) => exists)].getPath();
    });
    // return atom.project.getPaths()[0];
  },
  execCommandInLocalProject: function(command, cwd) {
    return new Promise((resolve, reject) => {
      exec(command, {cwd: cwd}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
  },
  execCommandInRemoteProject: function(command, path) {
    var node_ssh = require('node-ssh');
    var ssh = new node_ssh();
    var host = path.split("/")[2].split(":")[0];
    var workingPath = "/".concat(path.split("/").slice(3).join("/"));
    var nuclideConfig = atom.packages.config.get("nuclide");
    if (!nuclideConfig) {
      return;
    }
    var profile = nuclideConfig.connectionProfiles.find(profile => profile.params.server == host);
    if (!profile) {
      return;
    }
    var privateKey;
    if (profile.params.authMethod == "PRIVATE_KEY") {
      privateKey = profile.params.pathToPrivateKey;
    } else {
      return;
    }
    var port = profile.params.sshPort;
    var username = profile.params.username;

    return new Promise(function(resolve, reject) {
      console.log(host, username, privateKey);
      ssh.connect({
        host,
        username,
        privateKey
      }).then(function() {
        ssh.execCommand(command, {cwd: workingPath, stream: 'both', stdin: null}).then(function(result) {
          console.log('STDOUT: ' + result.stdout);
          console.log('STDERR: ' + result.stderr);
          ssh.end();
          if (result.code != 0)
            reject(result.stderr + " " + result.stdout);
          else
            resolve(result.stdout);
        });
      }).catch(function(error) {
        ssh.end();
        reject(error);
      });
    });
  },
  execCommandInProject: function(command) {
    return this.getRepoPath().then((path) => {
      if (path.startsWith("nuclide")) {
        return this.execCommandInRemoteProject(command, path)
      } else {
        return this.execCommandInLocalProject(command, path);
      }
    });
  },
  getUncommitedFiles: function() {
    return new Promise((resolve, reject) => {
      this.execCommandInProject(`git status -s | cut -c4-`).then(function(stdout) {
        resolve(stdout.split("\n").filter((path) => {return path != "";}));
      }).catch(function(stderr) {
        reject(stderr)
      });
    });
  },
  addFiles: function() {
    var gitAddCommand = `git add ${this.rootComponent.getFilesToAdd().map(function(file) {
      return file;
    }).join(' ')}`;
    return this.execCommandInProject(gitAddCommand);
  },
  commit: function() {
    return new Promise((resolve, reject) => {
      this.execCommandInProject(`git commit -m "${this.rootComponent.refs.inputText.value}"`)
        .then((stdout) => {
          this.rootComponent.refs.inputText.value = "";
          resolve(stdout);
        })
        .catch((stderr) => {
          reject(stderr);
        })
    });
  },
  save: function() {
    this.addFiles()
      .then(() => {
        this.commit()
          .then((stdout) => {
            atom.notifications.addSuccess("Commited with success", {
              detail: stdout,
              dismissable: false
            });
          })
          .catch(function(err) {
            atom.notifications.addWarning("Files have been staged");
            atom.notifications.addError("Error while commiting", {
              detail: err,
              dismissable: true
            });
          });
      })
      .catch(function(err) {
        atom.notifications.addError("Error while staging files", {
          detail: err,
          dismissable: true
        });
      })
  },
  toggle: function() {
    if (this.modalPanel.isVisible())
      this.modalPanel.hide()
    else {
      this.getUncommitedFiles()
        .then((files) => {
          if (files.length > 0) {
            var filesProperties = files.map(function(file) {
              return {name: file};
            });
            this.rootComponent = ReactDOM.render((<CommitManagerView files={filesProperties}/>), this.gitCommitViewElement);
            this.modalPanel.show()
            this.rootComponent.refs.inputText.focus();
          } else {
            atom.notifications.addWarning("No file to stage");
          }
        })
        .catch(function(err) {
          atom.notifications.addError("Error while getting status", {
            detail: err,
            dismissable: true
          });
        });
    }
  },
};
