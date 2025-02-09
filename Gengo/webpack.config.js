const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: {
        main: './public/scripts/main.js',
        'language-animation': './public/scripts/language-animation.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'scripts/[name].js',
        clean: {
            keep: /(assets|scripts)\//
        },
        publicPath: '/'
    },
    devServer: {
        port: 9000,
        hot: true,
        static: {
            directory: path.join(__dirname, 'dist'),
        },
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            }
        }
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
                test: /\.(png|jpg|jpeg|gif|svg)$/i,
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
            chunks: ['main']
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['language-animation']
        }),
        new HtmlWebpackPlugin({
            template: './public/about.html',
            filename: 'about.html',
            chunks: ['language-animation']
        }),
        new CopyWebpackPlugin({
            patterns: [
                // Copy CSS files
                {
                    from: 'public/styles.css',
                    to: 'styles.css'
                },
                {
                    from: 'public/styles2.css',
                    to: 'styles2.css'
                },
                // Copy assets directory with all contents
                {
                    from: 'public/assets',
                    to: 'assets',
                    globOptions: {
                        ignore: ['**/.DS_Store']
                    }
                },
                // Copy any other static assets you might have
                {
                    from: 'public/favicon.ico',
                    to: 'favicon.ico',
                    noErrorOnMissing: true
                }
            ]
        })
    ],
    resolve: {
        extensions: ['.js'],
        fallback: {
            "buffer": require.resolve("buffer/")
        }
    },
    optimization: {
        splitChunks: {
            chunks: 'all',
            name: false
        }
    }
};
