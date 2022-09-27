import type {GetServerSideProps, NextPage} from 'next'
import Head from 'next/head'
import styles from '../styles/StockPriceTable.module.css'


type Exchange = {
    codeExchange: string,
    idNotation: number,
}

type Instrument = {
    isin: string,
    id: string,
    type: string,
}

type Quote = {
    date: string,
    close: number,
    low: number,
    high: number,

}

type StockPriceTableProps = {
    quotes: Quote[],
    instrument: Instrument,
    exchange: Exchange,
}

const StockPriceTable: NextPage<StockPriceTableProps> = ({quotes}) => {
    const rows = []
    for (let quote of quotes) {
        const dateString = quote.date;
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

// noinspection JSUnusedGlobalSymbols
export const getServerSideProps: GetServerSideProps<StockPriceTableProps> = async (context) => {
    const {isin, exchange: exchangeCode} = context.query

    if (isin && typeof isin === "string") {
        const instrument = await search(isin);
        if (instrument === null) {
            return {notFound: true}
        }

        const exchange = await findExchangeConfig(instrument, exchangeCode as string)
        if (exchange === null) {
            return {notFound: true}
        }

        const range = "M3"
        const startDate = formatISODate(monthsAgo(3))
        const quotes = await fetchJson(`https://api.onvista.de/api/v1/instruments/FUND/${instrument.id}/eod_history?idNotation=${exchange.idNotation}&range=${range}&startDate=${startDate}`)
            .then(({datetimeLast, last, high, low}: EodHistory) =>
                datetimeLast.map((datetime, i) => {
                    const q: Quote = {
                        date: formatISODate(new Date(datetime * 1000)),
                        close: last[i],
                        high: high[i],
                        low: low[i]
                    }
                    return q
                })
            ).catch((error) => {
                console.error(`Fetching quotes failed`, error)
                return null
            })

        if (quotes === null) {
            return {notFound: true}
        }

        return {props: {instrument, exchange, quotes}}
    } else {
        return {notFound: true}
    }
}

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

function formatISODate(date: Date): string {
    return date.toISOString().split("T")[0]
}

function monthsAgo(months: number, date: Date = new Date()): Date {
    const result = new Date(date)
    result.setMonth(date.getMonth() - months)
    return result
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

function search(isin: string): Promise<Instrument | null> {
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
        }).catch((error) => {
            console.error(`Search for ISIN ${isin} failed`, error)
            return null
        })
}

function findExchangeConfig(instrument: Instrument, exchangeCode?: string): Promise<Exchange | null> {
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

            return exchange
        })
        .catch((error) => {
            console.error(`Search for exchange failed`, error)
            return null
        })
}

export default StockPriceTable
