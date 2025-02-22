const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
    const isDevelopment = argv.mode === 'development';

    return {
        entry: './public/scripts/main.js',
        output: {
            filename: 'bundle.js',
            path: path.resolve(__dirname, 'dist'),
            clean: true,
            publicPath: '/'
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
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': JSON.stringify(isDevelopment ? 'development' : 'production')
            }),
            // Extract CSS
            new MiniCssExtractPlugin({
                filename: 'css/[name].css',
                chunkFilename: 'css/[id].css'
            }),
            // Generate HTML files
            new HtmlWebpackPlugin({
                template: './public/index.html',
                filename: 'index.html',
                inject: true
            }),
            new HtmlWebpackPlugin({
                template: './public/main.html',
                filename: 'main.html',
                inject: true
            }),
            new HtmlWebpackPlugin({
                template: './public/about.html',
                filename: 'about.html',
                inject: true
            }),
            new HtmlWebpackPlugin({
                template: './public/Contact.html',
                filename: 'Contact.html',
                inject: true
            }),
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'public/assets', to: 'assets' },
                    { from: 'favicon.ico', to: 'favicon.ico' }
                ],
            }),
            // Copy static assets and styles
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'public/assets', to: 'assets' },
                    { from: 'public/styles.css', to: 'styles.css' },
                    { from: 'public/styles2.css', to: 'styles2.css' },
                    { from: 'favicon.ico', to: 'favicon.ico' }
                ]
            })
        ],
        resolve: {
            extensions: ['.js', '.css'],
            fallback: {
                "buffer": require.resolve("buffer/"),
                "crypto": false,
                "stream": false
            }
        },
        optimization: {
            splitChunks: {
                chunks: 'all'
            }
        },
        externals: {
            'socket.io-client': 'io'
        },
        devServer: {
            static: {
                directory: path.join(__dirname, 'dist'),
            },
            proxy: {
                '/socket.io': {
                    target: 'http://localhost:3000',
                    ws: true
                },
                '/api': {
                    target: 'http://localhost:3000'
                }
            },
            hot: true,
            historyApiFallback: true,
            port: 8080
        }
    };
};