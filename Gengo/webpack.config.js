const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const fs = require('fs');

// Function to get existing HTML files
const getHtmlFiles = () => {
  const publicDir = path.resolve(__dirname, 'public');
  return fs.readdirSync(publicDir)
    .filter(file => file.endsWith('.html'))
    .map(file => ({
      filename: file,
      template: path.join(publicDir, file)
    }));
};

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
    publicPath: '/'
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
    // Dynamically create HtmlWebpackPlugin instances for existing HTML files
    ...getHtmlFiles().map(file => 
      new HtmlWebpackPlugin({
        template: file.template,
        filename: file.filename,
        chunks: ['main', 'bundle', 'language-animation'],
        inject: 'body',
        links: [
          { rel: 'stylesheet', href: 'styles/styles.css' },
          // Conditionally add styles2.css for specific pages if needed
          ...(file.filename === 'about.html' || file.filename === 'contact.html' 
            ? [{ rel: 'stylesheet', href: 'styles/styles2.css' }] 
            : [])
        ]
      })
    ),
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
