const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    main: {
      import: './public/scripts/main.js',
      filename: 'scripts/main.js'
    },
    bundle: {
      import: './public/scripts/main.js',
      filename: 'scripts/bundle.js'
    },
    'language-animation': {
      import: './public/scripts/language-animation.js',
      filename: 'scripts/language-animation.js'
    }
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    clean: {
      keep: /(assets|scripts)\// // Keep both assets and scripts directories using a single RegExp
    },
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
        test: /\.(png|jpg|jpeg|gif|svg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/images/[name][ext]'
        }
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/main.html',
      filename: 'main.html',
      chunks: ['main']
    }),
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      chunks: ['bundle', 'language-animation']
    }),
    new HtmlWebpackPlugin({
      template: './public/about.html',
      filename: 'about.html',
      chunks: ['bundle', 'language-animation']
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
        },
        {
          from: 'public/assets',
          to: 'assets',
          noErrorOnMissing: true,
          globOptions: {
            ignore: ['**/.DS_Store']
          }
        },
        {
          from: 'public/scripts',
          to: 'scripts',
          noErrorOnMissing: true,
          globOptions: {
            ignore: ['**/*.js'] // Don't copy JS files as they're handled by webpack
          }
        }
      ]
    })
  ],
  resolve: {
    extensions: ['.js'],
    fallback: {
      "buffer": require.resolve("buffer/")
    }
  },
  optimization: {
    minimize: true,
    runtimeChunk: false
  }
};
