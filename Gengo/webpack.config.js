const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV || 'development',
    entry: {
        main: './public/scripts/main.js',
        animation: './public/scripts/language-animation.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'scripts/[name].bundle.js',
        clean: true,
        publicPath: '/',
        assetModuleFilename: 'assets/[name][ext]'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader'
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
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/fonts/[name][ext]'
                }
            },
            {
                test: /\.(mp3|wav)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/audio/[name][ext]'
                }
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['main', 'animation']
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
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
                    from: 'styles.css',
                    to: 'styles/styles.css',
                    context: 'public'
                },
                { 
                    from: 'styles2.css',
                    to: 'styles/styles2.css',
                    context: 'public'
                },
                {
                    from: 'assets',
                    to: 'assets',
                    context: 'public',
                    noErrorOnMissing: true
                }
            ]
        })
    ],
    devServer: {
        static: './dist',
        port: 9000,
        hot: true,
        historyApiFallback: true,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        }
    }
};
