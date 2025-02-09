const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: {
        main: './public/scripts/main.js',
        'language-animation': './public/scripts/language-animation.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'scripts/[name].[contenthash].js',
        clean: true,
        publicPath: '/',
        assetModuleFilename: 'assets/[name][ext]'
    },
    resolve: {
        extensions: ['.js', '.mjs', '.json'],
        alias: {
            'socket.io-client': path.resolve(__dirname, 'node_modules/socket.io-client/dist/socket.io.js'),
            '@': path.resolve(__dirname, 'src'),
            '@public': path.resolve(__dirname, 'public/scripts')
        },
        fallback: {
            "path": require.resolve("path-browserify")
    },
     caseSensitive: true,
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
                test: /\.(png|jpg|jpeg|gif|svg|ico)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/images/[name][ext]'
                }
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/fonts/[name][ext]'
                }
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['main']
        }),
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['main']
        }),
        new HtmlWebpackPlugin({
            template: './public/about.html',
            filename: 'about.html',
            chunks: ['main']
        }),
        new CopyWebpackPlugin({
            patterns: [
                { 
                    from: 'public/assets',
                    to: 'assets',
                    noErrorOnMissing: true,
                    globOptions: {
                        ignore: ['**/*.html']
                    }
                },
                {
                    from: 'public/styles.css',
                    to: 'styles.css',
                    noErrorOnMissing: true
                },
                {
                    from: 'public/styles2.css',
                    to: 'styles2.css',
                    noErrorOnMissing: true
                }
            ]
        }),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
            'process.env.SOCKET_URL': JSON.stringify(
                process.env.NODE_ENV === 'production' 
                    ? 'https://www.gengo.live' 
                    : 'http://localhost:3000'
            )
        })
    ],
    devServer: {
        port: 9000,
        static: {
            directory: path.join(__dirname, 'public'),
            publicPath: '/'
        },
        hot: true,
        historyApiFallback: true,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
                changeOrigin: true,
                secure: false,
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            }
        },
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
        }
    },
    optimization: {
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all'
                }
            }
        },
        runtimeChunk: 'single'
    }
};