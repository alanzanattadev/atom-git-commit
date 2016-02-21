'use babel'
import React from 'react';
import classNames from 'classnames';

var styles = {
  inputText: {
    width: "100%"
  },
  inputCheckBox: {
    float: "left"
  },
  fileName: {
    textAlign: "left"
  }
};

var CommitManagerView = React.createClass({
  getInitialState: function() {
    return {};
  },
  getDefaultProps: function() {
    return {
      files: []
    };
  },
  componentDidMount: function() {

  },
  componentWillUnmount: function() {

  },
  getFilesToAdd: function() {
    var filesToAdd = [];
    this.props.files.forEach((file) => {
      if (this.refs[file.name].checked)
        filesToAdd.push(file.name);
    });
    return filesToAdd;
  },
  render: function() {
    return (
      <div>
        <li style={{listStyle: "none"}}>
          {this.props.files.map((file, i) => {
            return (
              <ul key={`fileItem${i}`} style={{width: "100%", display:"flex", paddingLeft: "0px"}}>
                <span style={styles.fileName}>{file.name}</span>
                <div style={{display: "inline-flex", justifyContent: "flex-end", flexGrow: "1"}}>
                  <input ref={file.name} style={styles.inputCheckBox} type="checkbox" defaultChecked={true}/>
                </div>
              </ul>
            )
          })}
        </li>
        <input ref="inputText" type="text" className="native-key-bindings" style={styles.inputText} placeholder="Commit Message"/>
      </div>
    );
  }
});

export default CommitManagerView;
