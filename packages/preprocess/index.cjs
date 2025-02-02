const mdsvex = require("mdsvex");
const unified = require('unified')
const parse = require('remark-parse')
const visit = require('unist-util-visit')
const md5 = require("blueimp-md5");
const fs = require('fs')
const fsExtra = require('fs-extra')
const { removeSync, writeJSONSync, emptyDirSync } = fsExtra

const getRouteHash = function(filename){
    let route = filename.split("/src/pages")[1].replace(".md","")
    let routeHash = md5(route)
    return routeHash
}

const hasQueries = function(filename){
    let hash = getRouteHash(filename)
    return fs.existsSync("./.evidence/build/queries/"+hash)
}

const createModuleContext = function(filename){
    let routeHash = getRouteHash(filename)
    let moduleContext = ""
    if(hasQueries(filename)){
        moduleContext = 
            ` 
            export async function load({fetch}) {
                const res = await fetch('/api/${routeHash}.json')
                const {data} = await res.json()
                return {
                    props: {
                        data
                    }
                }
            }
            `
    }
    return moduleContext
} 

const createDefaultProps = function(filename){
    let defaultProps = `
        import { page } from '$app/stores';
        import Value from '@evidence-dev/components/viz/Value.svelte';
        import AreaChart from '@evidence-dev/components/viz/AreaChart.svelte';
        import BarChart from '@evidence-dev/components/viz/BarChart.svelte';
        import BubbleChart from '@evidence-dev/components/viz/BubbleChart.svelte';
        import ColumnChart from '@evidence-dev/components/viz/ColumnChart.svelte';
        import DataTable from '@evidence-dev/components/viz/DataTable.svelte';
        import Hist from '@evidence-dev/components/viz/Hist.svelte';
        import LineChart from '@evidence-dev/components/viz/LineChart.svelte';
        import ScatterPlot from '@evidence-dev/components/viz/ScatterPlot.svelte';
        `
    if(hasQueries(filename)){
        defaultProps = `
            export let data 
            import { page } from '$app/stores';
            import QueryViewer from '@evidence-dev/components/ui/QueryViewer.svelte';
            import Value from '@evidence-dev/components/viz/Value.svelte';
            import AreaChart from '@evidence-dev/components/viz/AreaChart.svelte';
            import BarChart from '@evidence-dev/components/viz/BarChart.svelte';
            import BubbleChart from '@evidence-dev/components/viz/BubbleChart.svelte';
            import ColumnChart from '@evidence-dev/components/viz/ColumnChart.svelte';
            import DataTable from '@evidence-dev/components/viz/DataTable.svelte';
            import Hist from '@evidence-dev/components/viz/Hist.svelte';
            import LineChart from '@evidence-dev/components/viz/LineChart.svelte';
            import ScatterPlot from '@evidence-dev/components/viz/ScatterPlot.svelte';
            `
    }
    return defaultProps
}

const updateBuildQueriesDir = function(content, filename){
    if (!fs.existsSync("./.evidence")){
        fs.mkdirSync("./.evidence");
    }
    if (!fs.existsSync("./.evidence/build")){
        fs.mkdirSync("./.evidence/build");
    }
    if (!fs.existsSync("./.evidence/build/queries")){
        fs.mkdirSync("./.evidence/build/queries");
    }
    let routeHash = getRouteHash(filename)
    let queryDir = `./.evidence/build/queries/${routeHash}`

    let queryStrings = [];  
    let tree = unified()
        .use(parse)
        .parse(content)   
    visit(tree, 'code', function(node) {
        let id = node.lang ?? 'untitled'
        let queryString = node.value.trim()
        queryStrings.push(
            {id, queryString}
        )
    })
    if (queryStrings.length === 0) {
        removeSync(queryDir)
        return
    }
    let queryHash = md5(JSON.stringify(queryStrings))
    if (fs.existsSync(`${queryDir}/${queryHash}.json`)){
        return
    }
    if (queryStrings.length > 0) {
        if(!fs.existsSync(queryDir)){
            fs.mkdirSync(queryDir)
            writeJSONSync(`${queryDir}/${queryHash}.json`, queryStrings)
        }else{
            emptyDirSync(queryDir)
            writeJSONSync(`${queryDir}/${queryHash}.json`, queryStrings)
        }
    }
}

function highlighter(code, lang) {
    return `
    <QueryViewer queryString = '${code}' queryID = "${lang ?? 'untitled'}" queryResult = {data.${lang ?? 'untitled'}}/>
    `;
}

module.exports = function evidencePreprocess(){
    return [
        {
            markup({content, filename}){
                if(filename.endsWith(".md")){
                    updateBuildQueriesDir(content, filename)
                }
            }
        },
        mdsvex.mdsvex(
            {extensions: [".md"],
            smartypants: {
                quotes: false,
                ellipses: true,
                backticks: true,
                dashes: 'oldschool',
            },
            highlight: {
                highlighter
            },
        }),
        // Add both script tags to all markdown files, if they are missing 
        {
            markup({content, filename}) {
                if(filename.endsWith(".md")){
                    if(!content.match(/\<script(.*)\>/)){
                        return {code: '<script context="module"> </script>' + '<script> </script>' + content}
                    }
                    if(!content.match(/\<script(.*)context\=\"module\"(.*)\>/)){
                        return {code: '<script context="module"> </script>' + content}
                    }
                    if(!content.match(/\<script\>/)){
                        return {code: '<script> </script>' + content}
                    }
                }
            }
        },
        {
            script({filename, attributes}) { 
                if(filename.endsWith(".md")){
                    if(attributes.context == "module"){
                        return {code: createModuleContext(filename)}
                    }
                }
            }
        },
        {
            script({content, filename, attributes}) {
                if(filename.endsWith(".md")){
                    if(attributes.context != "module") {
                        return {code: createDefaultProps(filename) + content }
                    }	
                }
            }
        }
    ]
} 
