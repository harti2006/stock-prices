import type {NextPage} from 'next'
import Head from 'next/head'
import styles from '../styles/Home.module.css'
import {useEffect, useState} from "react";
import {useRouter} from "next/router";


type SearchResult = {
    isin: string,
    entityValue: string,
    entityType: string,
}

type Snapshot = {
    quoteList: {
        list: { market: Exchange }[]
    }
}

type EodHistory = {
    datetimeLast: number[],
    last: number[],
    low: number[],
    high: number[],
}

type Exchange = {
    codeExchange: string,
    idNotation: number,
}

type Instrument = {
    isin: string,
    id: string,
    type: string,
}

type Config = {
    instrument: Instrument,
    exchange: Exchange,
}

type Quote = {
    date: Date,
    close: number,
    low: number,
    high: number,

}

function fetchJson(url: string): Promise<any> {
    return fetch(url).then(async response => {
        if (response.ok) {
            return response.json()
        } else {
            const body = await response.text()
            throw new Error(`Failed to get ${url}'. ${body}`)
        }
    })
}

function search(isin: string): Promise<Instrument> {
    return fetchJson(`https://api.onvista.de/api/v1/instruments/query?limit=2&searchValue=${isin}`)
        .then((searchResults: { list: SearchResult[] }) => {
            const match = searchResults.list.find((searchResult: SearchResult) => searchResult.isin === isin);
            if (!match) {
                throw new Error(`Did not find instrument with ISIN ${isin}`)
            }

            const instrument: Instrument = {
                isin: match.isin,
                id: match.entityValue,
                type: match.entityType,
            }

            return instrument
        })
}

function findExchangeConfig(instrument: Instrument, exchangeCode?: string): Promise<Config> {
    let configApi: string
    switch (instrument.type) {
        case "DERIVATIVE":
            configApi = `https://api.onvista.de/api/v1/derivatives/ISIN:${instrument.isin}/snapshot`
            break;

        default:
            throw new Error(`type '${instrument.type}' not implemented.`)
    }

    return fetchJson(configApi)
        .then((config: Snapshot) => {
            const availableExchanges = config.quoteList
                .list
                .map(it => it.market)

            if (availableExchanges.length === 0) throw new Error("No exchange found")

            const exchange = availableExchanges
                .find(({codeExchange}) => {
                    if (exchangeCode) {
                        return codeExchange === exchangeCode
                    } else {
                        return true
                    }
                });

            if (!exchange) throw new Error(`Exchange ${exchange} does not exist. Available exchanges: ${availableExchanges.map(it => it.codeExchange)}`)

            return {instrument, exchange}
        })
}

const Home: NextPage = () => {
    const router = useRouter()
    const {isin, exchange} = router.query
    const [data, setData] = useState<Quote[] | null>(null)
    const [isLoading, setLoading] = useState(false)

    useEffect(() => {
        if (isin && typeof isin === "string") {
            setLoading(true)
            search(isin)
                .then(instrument => findExchangeConfig(instrument, exchange as string))
                .then(({instrument, exchange}) => {
                    return fetchJson(`https://api.onvista.de/api/v1/instruments/FUND/${instrument.id}/eod_history?idNotation=${exchange.idNotation}&range=M1&startDate=2022-09-01`)
                        .then(({datetimeLast, last, high, low}: EodHistory) =>
                            datetimeLast.map((datetime, i) => {
                                const q: Quote = {
                                    date: new Date(datetime * 1000),
                                    close: last[i],
                                    high: high[i],
                                    low: low[i]
                                }
                                return q
                            })
                        )
                })
                .then(quotes => {
                    setData(quotes)
                    setLoading(false)
                })

        }
    }, [isin, exchange])

    if (isLoading) return <p>Loading...</p>
    if (!data) return <p>No quote data</p>

    const rows = []
    for (let quote of data) {
        const dateString = quote.date.toISOString().slice(0, 10);
        rows.push(<tr key={dateString}>
            <td>{dateString}</td>
            <td>{quote.close}</td>
            <td>{quote.low}</td>
            <td>{quote.high}</td>
        </tr>)
    }

    return (
        <div className={styles.container}>
            <Head>
                <title>Stock Prices</title>
                <link rel="icon" href="/favicon.ico"/>
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Stock Prices</h1>
                <table>
                    <thead>
                    <tr>
                        <th>Datum</th>
                        <th>Schluss</th>
                        <th>Tief</th>
                        <th>Hoch</th>
                    </tr>
                    </thead>
                    <tbody>{rows}</tbody>
                </table>
            </main>
        </div>
    )
}

export default Home
