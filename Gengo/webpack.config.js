const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');

module.exports = {
    entry: {
        main: './public/scripts/main.js',
        'agoraClient': './public/scripts/agoraClient.js',
        'contentMonitor': './public/scripts/contentMonitor.js'
    },
    output: {
        filename: 'scripts/[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
        publicPath: '/',
        globalObject: 'this'
    },
    experiments: {
        outputModule: false,
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
                    },
                },
            },
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'postcss-loader',
                ],
            },
            {
                test: /\.(png|jpg|jpeg|gif|svg)$/,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/[name][ext]'
                }
            }
        ],
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: 'css/[name].css'
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['main'],
            favicon: './favicon.ico'
        }),
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['main', 'agoraClient', 'contentMonitor'],
            favicon: './favicon.ico'
        }),
        new HtmlWebpackPlugin({
            template: './public/about.html',
            filename: 'about.html',
            chunks: ['main'],
            favicon: './favicon.ico'
        }),
        new HtmlWebpackPlugin({
            template: './public/Contact.html',
            filename: 'Contact.html',
            chunks: ['main'],
            favicon: './favicon.ico'
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'public/assets', to: 'assets' },
                { from: 'public/icons', to: 'icons' },
                { from: 'favicon.ico', to: 'favicon.ico' },
                { from: 'public/styles.css', to: 'styles.css' },
                { from: 'public/styles2.css', to: 'styles2.css' },
                { 
                    from: 'node_modules/agora-rtc-sdk-ng/AgoraRTC_N.js',
                    to: 'scripts/AgoraRTC_N.js',
                    noErrorOnMissing: true
                },
                {
                    from: 'node_modules/agora-rtc-sdk/AgoraRTCSDK-*.js',
                    to: 'scripts/AgoraRTC_N.js',
                    noErrorOnMissing: true
                }
            ],
        }),
        new Dotenv(),
        new webpack.DefinePlugin({
            'process.env.MAPBOX_ACCESS_TOKEN': JSON.stringify(process.env.MAPBOX_ACCESS_TOKEN),
            'process.env.MAPBOX_STYLE': JSON.stringify(process.env.MAPBOX_STYLE),
            'process.env.MAPBOX_DEFAULT_CENTER': JSON.stringify(process.env.MAPBOX_DEFAULT_CENTER),
            'process.env.MAPBOX_DEFAULT_ZOOM': JSON.stringify(process.env.MAPBOX_DEFAULT_ZOOM)
        })
    ],
    resolve: {
        extensions: ['.js']
    },
    devServer: {
        port: 9000,
        static: {
            directory: path.join(__dirname, 'dist'),
        },
        hot: true,
        historyApiFallback: {
            rewrites: [
                { from: /^\/(about|Contact|main)$/, to: context => `/${context.match[1]}.html` },
                { from: /./, to: '/index.html' }
            ]
        },
        proxy: {
            '/api': 'http://localhost:3000',
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        }
    },
    optimization: {
        splitChunks: {
            chunks: 'all'
        }
    }
};