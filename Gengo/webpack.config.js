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
        publicPath: '/'
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
                    from: 'public/styles',
                    to: 'styles'
                },
                {
                    from: 'public/assets',
                    to: 'assets',
                    noErrorOnMissing: true
                },
                {
                    from: 'public/scripts',
                    to: 'scripts',
                    globOptions: {
                        ignore: ['**/*.js'] // Don't copy JS files as they're handled by webpack
                    }
                }
            ]
        })
    ],
    devServer: {
        static: {
            directory: path.join(__dirname, 'public'),
            publicPath: '/'
        },
        port: 9000,
        hot: true,
        historyApiFallback: true,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            },
            '/api': {
                target: 'http://localhost:3000'
            }
        }
    },
    resolve: {
        extensions: ['.js']
    }
};
