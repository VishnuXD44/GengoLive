const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
    entry: {
        main: './public/scripts/main.js',
        'language-animation': './public/scripts/language-animation.js',
        styles: './public/styles.css',     // Add styles.css as an entry point
        styles2: './public/styles2.css'    // Add styles2.css as an entry point
    },
    output: {
        filename: '[name].bundle.js',
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
        new MiniCssExtractPlugin({
            filename: 'css/[name].css'  // Output CSS files to css directory
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['main', 'language-animation', 'styles'],
            inject: true
        }),
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['main', 'language-animation', 'styles'],
            inject: true
        }),
        new HtmlWebpackPlugin({
            template: './public/about.html',
            filename: 'about.html',
            chunks: ['main', 'styles2'],
            inject: true
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'public/assets', to: 'assets' },
                { from: 'favicon.ico', to: 'favicon.ico' }
            ],
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
            }
    ]
    }),

    ],
    resolve: {
        extensions: ['.js', '.css'],
        fallback: {
            "buffer": require.resolve("buffer/"),
            "crypto": false,
            "stream": false
        }
    }
};