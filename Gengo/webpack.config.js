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
        filename: 'scripts/[name].[contenthash].js',
        clean: {
            keep: /assets\// // Preserve assets directory
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
                ws: true,
                changeOrigin: true
            }
        }
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
                    }
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
                    filename: 'assets/images/[name].[hash][ext]'
                }
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/fonts/[name].[hash][ext]'
                }
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['main', 'language-animation']
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['language-animation']
        }),
        new HtmlWebpackPlugin({
            template: './public/about.html',
            filename: 'about.html',
            chunks: ['language-animation'],
            inject: 'body'
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
                    to: 'assets',
                    noErrorOnMissing: true,
                    globOptions: {
                        ignore: ['**/.DS_Store']
                    }
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
        },
        runtimeChunk: 'single'
    }
};
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
        filename: 'scripts/[name].[contenthash].js',
        clean: {
            keep: /assets\// // Preserve assets directory
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
                ws: true,
                changeOrigin: true
            }
        }
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
                    }
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
                    filename: 'assets/images/[name].[hash][ext]'
                }
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'assets/fonts/[name].[hash][ext]'
                }
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/main.html',
            filename: 'main.html',
            chunks: ['main', 'language-animation']
        }),
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['language-animation']
        }),
        new HtmlWebpackPlugin({
            template: './public/about.html',
            filename: 'about.html',
            chunks: ['language-animation'],
            inject: 'body'
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
                    to: 'assets',
                    noErrorOnMissing: true,
                    globOptions: {
                        ignore: ['**/.DS_Store']
                    }
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
        },
        runtimeChunk: 'single'
    }
};
