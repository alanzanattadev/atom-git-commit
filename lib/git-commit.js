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

  serialize: function() {
    return {gitCommitViewState: this.gitCommitView.serialize()};
  },
  getRepoPath: function() {
    return atom.workspace.getActivePaneItem().buffer.file.getParent().getPath();
    // return atom.project.getPaths()[0];
  },
  getUncommitedFiles: function() {
    return new Promise((resolve, reject) => {
      exec(`git status -s | cut -c4-`, {cwd: this.getRepoPath()}, function(err, stdout, stderr) {
        if (err)
          reject(stderr);
        else
          resolve(stdout.split("\n").filter((path) => {return path != "";}));
      });
    })
  },
  addFiles: function() {
    return new Promise((resolve, reject) => {
      var gitAddCommand = `git add ${this.rootComponent.getFilesToAdd().map(function(file) {
        return file;
      }).join(' ')}`;
      exec(gitAddCommand, {cwd: this.getRepoPath()}, function(err, stdout, stderr) {
        if (err)
          reject(stderr);
        else
          resolve(stdout);
      });
    });
  },
  commit: function() {
    return new Promise((resolve, reject) => {
      var gitCommitCommand = `git commit -m "${this.rootComponent.refs.inputText.value}"`
      exec(gitCommitCommand, {cwd: this.getRepoPath()}, (err, stdout, stderr) => {
        if (err)
          reject(stderr);
        else {
          this.rootComponent.refs.inputText.value = "";
          resolve(stdout);
        }
      });
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
