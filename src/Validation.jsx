import React from 'react';

class Validation extends React.Component {
  render() {
      const valid = this.props.valid ? "✅" : "🤔";
      return <span className="valid">{ valid }</span>;
  }
}

export default Validation;