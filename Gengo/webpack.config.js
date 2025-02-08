const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        main: './public/scripts/main.js',
        animation: './public/scripts/language-animation.js'
    },
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
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
                            ['@babel/preset-env', {
                                targets: {
                                    browsers: ['last 2 versions']
                                },
                                modules: false
                            }]
                        ]
                    }
                }
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['animation'],
            inject: true
        }),
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['main'],
            inject: true
        }),
        new HtmlWebpackPlugin({
            template: './public/about.html',
            filename: 'about.html',
            chunks: ['animation'],
            inject: true
        }),
        new CopyPlugin({
            patterns: [
                { 
                    from: "public/styles.css",
                    to: "styles.css"
                },
                { 
                    from: "public/styles2.css",
                    to: "styles2.css"
                },
                {
                    from: "public/assets",
                    to: "assets",
                    noErrorOnMissing: true
                }
            ],
        }),
    ],
    resolve: {
        extensions: ['.js'],
        fallback: {
            "buffer": require.resolve("buffer/")
        }
    },
    devServer: {
        static: {
            directory: path.join(__dirname, 'dist'),
        },
        compress: true,
        port: 9000,
        hot: true,
        open: true,
        historyApiFallback: true,
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        }
    },
    performance: {
        hints: false,
        maxEntrypointSize: 512000,
        maxAssetSize: 512000
    },
    optimization: {
        splitChunks: {
            chunks: 'all',
        },
    },
};
