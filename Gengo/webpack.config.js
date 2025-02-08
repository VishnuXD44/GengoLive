const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: {
        bundle: './public/scripts/main.js',
        main: './public/scripts/main.js'
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
        publicPath: '/'
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
        extensions: ['.js']
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                    },
                },
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(png|jpg|jpeg|gif)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/[name][ext]'
                }
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['runtime', 'bundle', 'main'],
            inject: true
        }),
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['runtime', 'bundle', 'main'],
            inject: true
        }),
        new HtmlWebpackPlugin({
            template: './public/about.html',
            filename: 'about.html',
            chunks: ['runtime', 'bundle', 'main'],
            inject: true
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
                    to: 'assets'
                },
                { 
                    from: 'public/scripts/language-animation.js',
                    to: 'scripts/language-animation.js'
                },
                { 
                    from: 'src/utils/webrtc.js',
                    to: 'utils/webrtc.js'
                }
            ]
        })
    ],
    optimization: {
        runtimeChunk: 'single',
        splitChunks: {
            chunks: 'all',
        }
    },
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist'),
            publicPath: '/'
        },
        compress: true,
        port: 9000,
        hot: true,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true,
                changeOrigin: true
            },
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true
            }
        }
    }
};
