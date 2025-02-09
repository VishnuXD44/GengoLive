const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'production',
  entry: {
    main: './public/scripts/main.js',
    'language-animation': './public/scripts/language-animation.js',
    bundle: './public/scripts/main.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'scripts/[name].js',
    publicPath: '/',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader, 
          'css-loader'
        ]
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]'
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/main.html',
      filename: 'main.html',
      chunks: ['main', 'language-animation', 'bundle']
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      chunks: ['main', 'bundle']
    }),
    new HtmlWebpackPlugin({
      template: './public/about.html',
      filename: 'about.html',
      chunks: ['main', 'bundle']
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public/styles.css',
          to: 'styles/styles.css'
        },
        {
          from: 'public/styles2.css',
          to: 'styles/styles2.css'
        },
        {
          from: 'public/assets',
          to: 'assets'
        }
      ]
    }),
    new MiniCssExtractPlugin({
      filename: 'styles/[name].css'
    })
  ],
  devServer: {
    port: 9000,
    static: {
      directory: path.join(__dirname, 'dist'),
      publicPath: '/'
    },
    historyApiFallback: true,
    hot: true,
    compress: true,
    open: true,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
  },
  resolve: {
    extensions: ['.js', '.css']
  }
};
