const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    bundle: './public/scripts/main.js',
    'language-animation': './public/scripts/language-animation.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
    publicPath: '/'
  },
  devServer: {
    port: 9000,
    hot: true,
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true
      }
    }
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
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/images/[name][ext]'
        }
      }
    ]
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
      name: 'vendor'
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/main.html',
      filename: 'main.html',
      chunks: ['bundle', 'vendor']
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      chunks: ['bundle', 'language-animation', 'vendor']
    }),
    new HtmlWebpackPlugin({
      template: './public/about.html',
      filename: 'about.html',
      chunks: ['bundle', 'language-animation', 'vendor']
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'public/styles.css',
          to: 'styles.css'
        },
        {
          from: 'public/styles2.css',
          to: 'styles2.css'
        }
      ]
    })
  ],
  resolve: {
    extensions: ['.js'],
    fallback: {
      "buffer": require.resolve("buffer/")
    }
  }
};
