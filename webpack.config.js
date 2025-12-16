import CopyPlugin from "copy-webpack-plugin";
import ESLintPlugin from "eslint-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import path from "path";
import TerserPlugin from "terser-webpack-plugin";
import { fileURLToPath } from "url";
import webpack from "webpack";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    entry: {
      main: "./src/client/Main.ts",
    },
    output: {
      publicPath: "/",
      filename: "js/[name].[contenthash].js", // Added content hash
      path: path.resolve(__dirname, "static"),
      clean: isProduction,
    },
    module: {
      rules: [
        {
          test: /\.bin$/,
          type: "asset/resource", // Changed from raw-loader
          generator: {
            filename: "binary/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.txt$/,
          type: "asset/resource", // Changed from raw-loader
          generator: {
            filename: "text/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.ts$/,
          use: "ts-loader",
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: [
            "style-loader",
            {
              loader: "css-loader",
              options: {
                importLoaders: 1,
              },
            },
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  plugins: ["tailwindcss", "autoprefixer"],
                },
              },
            },
          ],
        },
        {
          test: /\.(webp|png|jpe?g|gif)$/i,
          type: "asset/resource",
          generator: {
            filename: "images/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.html$/,
          use: ["html-loader"],
        },
        {
          test: /\.svg$/,
          type: "asset/resource", // Changed from asset/inline for caching
          generator: {
            filename: "images/[name].[contenthash][ext]", // Added content hash
          },
        },
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/,
          type: "asset/resource", // Changed from file-loader
          generator: {
            filename: "fonts/[name].[contenthash][ext]", // Added content hash and fixed path
          },
        },
      ],
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"],
      alias: {
        "protobufjs/minimal": path.resolve(
          __dirname,
          "node_modules/protobufjs/minimal.js",
        ),
      },
      fallback: {
        crypto: "crypto-browserify",
        stream: "stream-browserify",
        buffer: "buffer",
        util: "util",
        fs: false,
        path: false,
      },
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/client/index.html",
        filename: "index.html",
        chunks: ["main"],
        // Add optimization for HTML
        minify: isProduction
          ? {
              collapseWhitespace: true,
              removeComments: true,
              removeRedundantAttributes: true,
              removeScriptTypeAttributes: true,
              removeStyleLinkTypeAttributes: true,
              useShortDoctype: true,
            }
          : false,
      }),
      new webpack.DefinePlugin({
        "process.env.WEBSOCKET_URL": JSON.stringify(
          //isProduction ? "wss://api.solarfront.io" : "",
          isProduction ? "" : "",
        ),
      }),
      new webpack.DefinePlugin({
        "process.env.API_URL": JSON.stringify(
          isProduction ? "https://api.solarfront.io" : "",
          //isProduction ? "https://dev-api.solarfront.io" : "",
        ),
      }),
      new webpack.DefinePlugin({
        "process.env.GAME_ENV": JSON.stringify(isProduction ? "prod" : "dev"),
      }),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
        process: "process/browser",
      }),
      new CopyPlugin({
        patterns: [
          {
            from: path.resolve(__dirname, "resources"),
            to: path.resolve(__dirname, "static"),
            noErrorOnMissing: true,
          },
        ],
        options: { concurrency: 100 },
      }),
      new ESLintPlugin({
        context: __dirname,
      }),
    ],
    optimization: {
      // Add optimization configuration for better caching
      runtimeChunk: "single",
      splitChunks: {
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
          },
        },
      },
      // Only in production: remove all console statements
      ...(isProduction && {
        minimizer: [
          new TerserPlugin({
            terserOptions: {
              compress: {
                drop_console: true, // Remove all console.* statements
              },
            },
          }),
        ],
      }),
    },
    devServer: isProduction
      ? {}
      : {
          devMiddleware: { writeToDisk: true },
          static: {
            directory: path.join(__dirname, "static"),
            publicPath: "/",
            serveIndex: true,
            watch: true,
          },
          historyApiFallback: {
            rewrites: [
              { from: /./, to: "/index.html" },
            ],
          },
          compress: true,
          host: "0.0.0.0",
          port: 9000,
          allowedHosts: "all",
          // Add proper MIME type handling for audio files
          setupMiddlewares: (middlewares, devServer) => {
            devServer.app.use((req, res, next) => {
              // Set correct MIME type for audio files
              if (req.path.endsWith('.mp3')) {
                res.setHeader('Content-Type', 'audio/mpeg');
                res.setHeader('Accept-Ranges', 'bytes');
              }
              next();
            });
            return middlewares;
          },
          proxy: [
            // WebSocket proxies
            {
              context: ["/socket"],
              target: "ws://0.0.0.0:3000",
              ws: true,
              changeOrigin: true,
              logLevel: "debug",
            },
            // Worker WebSocket proxies - using direct paths without /socket suffix
            {
              context: ["/w0"],
              target: "ws://0.0.0.0:3001",
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w1"],
              target: "ws://0.0.0.0:3002",
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w2"],
              target: "ws://0.0.0.0:3003",
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w3"],
              target: "ws://0.0.0.0:3004",
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w4"],
              target: "ws://0.0.0.0:3005",
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w5"],
              target: "ws://0.0.0.0:3006",
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w6"],
              target: "ws://0.0.0.0:3007",
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w7"],
              target: "ws://0.0.0.0:3008",
              ws: true,
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            // Worker proxies for HTTP requests
            {
              context: ["/w0"],
              target: "http://0.0.0.0:3001",
              pathRewrite: { "^/w0": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w1"],
              target: "http://0.0.0.0:3002",
              pathRewrite: { "^/w1": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w2"],
              target: "http://0.0.0.0:3003",
              pathRewrite: { "^/w2": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w3"],
              target: "http://0.0.0.0:3004",
              pathRewrite: { "^/w3": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w4"],
              target: "http://0.0.0.0:3005",
              pathRewrite: { "^/w4": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w5"],
              target: "http://0.0.0.0:3006",
              pathRewrite: { "^/w5": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w6"],
              target: "http://0.0.0.0:3007",
              pathRewrite: { "^/w6": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            {
              context: ["/w7"],
              target: "http://0.0.0.0:3008",
              pathRewrite: { "^/w7": "" },
              secure: false,
              changeOrigin: true,
              logLevel: "debug",
            },
            // Original API endpoints
            {
              context: [
                "/api/env",
                "/api/game",
                "/api/public_lobbies",
                "/api/join_game",
                "/api/start_game",
                "/api/create_game",
                "/api/archive_singleplayer_game",
                "/api/auth/callback",
                "/api/auth/discord",
                "/api/kick_player",
              ],
              target: "http://0.0.0.0:3000",
              secure: false,
              changeOrigin: true,
            },
          ],
        },
  };
};
