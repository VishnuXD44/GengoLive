const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');

// Load environment variables, but don't fail if .env is missing
try {
    require('dotenv').config();
} catch (err) {
    console.log('No .env file found, using environment variables');
}

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: {
        main: './public/scripts/main.js',
        'agoraClient': './public/scripts/agoraClient.js',
        'contentMonitor': './public/scripts/contentMonitor.js',
        'learn': './public/scripts/learn.js'
    },
    output: {
        filename: 'scripts/[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
        publicPath: '/',
        globalObject: 'this'
    },
    experiments: {
        // Remove outputModule as it's causing issues
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            '@babel/preset-env'
                        ],
                        plugins: [
                            '@babel/plugin-transform-runtime'
                        ]
                    }
                }
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
            template: './public/learn.html',
            filename: 'learn.html',
            chunks: ['learn'],
            favicon: './favicon.ico'
        }),
        new HtmlWebpackPlugin({
            template: './public/Contact.html',
            filename: 'Contact.html',
            chunks: ['main'],
            favicon: './favicon.ico'
        }),
        new HtmlWebpackPlugin({
            template: './public/privacy.html',
            filename: 'privacy.html',
            chunks: ['main'],
            favicon: './favicon.ico'
        }),
        new HtmlWebpackPlugin({
            template: './public/terms.html',
            filename: 'terms.html',
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
        new Dotenv({
            path: path.resolve(__dirname, '.env'),
            systemvars: true,
            safe: false,
            defaults: false,
            silent: true
        }),
    ],
    resolve: {
        extensions: ['.js'],
        fallback: {
            "buffer": require.resolve("buffer/"),
            "crypto": require.resolve("crypto-browserify"),
            "stream": require.resolve("stream-browserify"),
            "util": require.resolve("util/"),
            "process": require.resolve("process/browser")
        }
    },
    devServer: {
        port: process.env.PORT || 9000,
        static: {
            directory: path.join(__dirname, 'dist'),
        },
        hot: true,
        historyApiFallback: {
            rewrites: [
                { from: /^\/(about|Contact|main|learn|privacy|terms)$/, to: context => `/${context.match[1]}.html` },
                { from: /./, to: '/index.html' }
            ]
        },
        proxy: {
            '/api': process.env.API_URL || 'http://localhost:3000',
            '/socket.io': {
                target: process.env.API_URL || 'http://localhost:3000',
                ws: true
            }
        }
    },
    optimization: {
        splitChunks: {
            chunks: 'all',
            minSize: 20000,
            maxSize: 244000,
            minChunks: 1,
            maxAsyncRequests: 30,
            maxInitialRequests: 30,
            automaticNameDelimiter: '~',
            enforceSizeThreshold: 50000,
            cacheGroups: {
                defaultVendors: {
                    test: /[\\/]node_modules[\\/]/,
                    priority: -10,
                    reuseExistingChunk: true
                },
                default: {
                    minChunks: 2,
                    priority: -20,
                    reuseExistingChunk: true
                }
            }
        }
    }
};