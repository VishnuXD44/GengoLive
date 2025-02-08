const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development', // Explicitly set the mode
    entry: {
        main: './public/scripts/main.js'
    },
    output: {
        filename: '[name].bundle.js', // Changed from bundle.js to [name].bundle.js
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
            },
        ],
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
            name: false
        }
    }
};
