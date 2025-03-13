const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
// Remove dotenv-webpack dependency since it's causing issues
// const Dotenv = require('dotenv-webpack');

module.exports = {
    entry: {
        main: './public/scripts/main.js',
        'language-animation': './public/scripts/language-animation.js',
        'agoraClient': './public/scripts/agoraClient.js',
        'contentMonitor': './public/scripts/contentMonitor.js'  // Add this line
    },
    output: {
        filename: 'scripts/[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
        publicPath: '/',
        library: {
            type: 'module'
        }
    },
    experiments: {
        outputModule: true,
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
                    'css-loader'
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
        // Remove Dotenv plugin reference
        // new Dotenv({
        //    systemvars: true, 
        //    safe: true 
        // }),
        new MiniCssExtractPlugin({
            filename: 'css/[name].css'
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['main', 'language-animation'],
            favicon: './favicon.ico'
        }),
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['main', 'language-animation', 'agoraClient', 'contentMonitor'], // Add contentMonitor
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
                // Ensure Agora SDK is copied - both possible sources
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
        historyApiFallback: true,
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