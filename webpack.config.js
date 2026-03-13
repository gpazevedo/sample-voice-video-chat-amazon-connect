const path = require('path');

module.exports = {
  entry: {
    'amazon-connect-web-app': './src/index.ts'
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.webpack.json'
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    library: {
      name: 'AmazonConnectWebApp',
      type: 'umd'
    },
    globalObject: 'this'
  },
  devtool: 'source-map',
  mode: 'development'
};
