import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Chat → Catalog</title>
        <meta
          name="description"
          content="Convert group chat transcripts into clean, validated Catalogs (menus)."
        />

        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

        <link rel="alternate icon" href="/favicon.ico" />

        <meta name="theme-color" content="#2563EB" />

        <meta property="og:title" content="Chat → Catalog" />
        <meta
          property="og:description"
          content="Convert group chat transcripts into clean, validated Catalogs (menus)."
        />
      </Head>

      <Component {...pageProps} />
    </>
  );
}
