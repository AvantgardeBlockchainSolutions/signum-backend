const { ethers } = require("ethers");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const web3 = require("web3");

// Replace with your own Infura or Alchemy API URL or a local Ethereum node
const provider = new ethers.providers.JsonRpcProvider(
  "https://rpc.pulsechain.com"
);

const sepoliaProvider = new ethers.providers.JsonRpcProvider(
  "https://ethereum-sepolia-rpc.publicnode.com"
);

// Load the ABI JSON file
const flexABI = JSON.parse(fs.readFileSync("abi/SignumFlexABI.json", "utf8"));
const autopayABI = JSON.parse(fs.readFileSync("abi/AutopayABI.json", "utf8"));

// Replace with your contract's address
const flexContractAddress = "0x09D07923EA339A2aDe40f44BCEE74b2A88a99a54";
const autopayContractAddress = "0x48C7A06cb36F6f0d575e083A4e844Ba08890e452";

// Initialize the contract
const flexContract = new ethers.Contract(
  flexContractAddress,
  flexABI,
  provider
);

const autopayContract = new ethers.Contract(
  autopayContractAddress,
  autopayABI,
  provider
);

// File path to store event data
const newReportDataFilePath = "./eventData.json";
const tipAddedDataFilePath = "./eventData1.json";

// Function to save event data to file
function saveNewReportEventData(eventData) {
  let data = [];
  if (fs.existsSync(newReportDataFilePath)) {
    const fileContent = fs.readFileSync(newReportDataFilePath);
    data = JSON.parse(fileContent);
  }

  data.push(eventData);

  if (data.length > 1000) {
    data.splice(0, data.length - 1000);
  }

  fs.writeFileSync(newReportDataFilePath, JSON.stringify(data, null, 2));
  console.log("NewReport event data saved to JSON file");
}

function saveTipAddedEventData(eventData) {
  let data = [];
  if (fs.existsSync(tipAddedDataFilePath)) {
    const fileContent = fs.readFileSync(tipAddedDataFilePath);
    data = JSON.parse(fileContent);
  }

  data.push(eventData);

  if (data.length > 1000) {
    data.splice(0, data.length - 1000);
  }

  fs.writeFileSync(tipAddedDataFilePath, JSON.stringify(data, null, 2));
  console.log("TipAdded event data saved to JSON file");
}

// Function to fetch historical events
async function fetchHistoricalEvents(fromBlock, toBlock) {
  console.log(
    `Fetching historical events from block ${fromBlock} to ${toBlock}...`
  );
  const events = await flexContract.queryFilter(
    "NewReport",
    fromBlock,
    toBlock
  );

  events.forEach((event) => {
    const eventData = {
      _queryId: event.args._queryId,
      _time: event.args._time.toString(),
      _value: event.args._value,
      _nonce: event.args._nonce.toString(),
      _queryData: event.args._queryData,
      _reporter: event.args._reporter,
      raw: event, // Store the full raw event data
      timestamp: new Date().toISOString(),
    };

    saveNewReportEventData(eventData);
  });

  const tipEvents = await autopayContract.queryFilter(
    "TipAdded",
    5240272,
    5285029
  );

  tipEvents.forEach((event) => {
    const eventData = {
      _queryId: event.args._queryId,
      _amount: event.args._amount.toString(),
      _queryData: event.args._queryData,
      _tipper: event.args._tipper,
      _startTime: Math.floor(Date.now() / 1000),
      raw: event, // Store the full raw event data
      txnHash: event.transactionHash,
      __typename: "TipAddedEntity",
    };

    saveTipAddedEventData(eventData);
  });
}

// Fetch historical events (adjust the block range as needed)
const startBlock = 21049876; // Replace with the block number you want to start from
const endBlock = "latest"; // You can replace 'latest' with a specific block number if needed
fetchHistoricalEvents(startBlock, endBlock);

// Set up Express server to serve the JSON data
const app = express();

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

app.get("/events", (req, res) => {
  if (fs.existsSync(newReportDataFilePath)) {
    const fileContent = fs.readFileSync(newReportDataFilePath);
    res.json(JSON.parse(fileContent));
  } else {
    res.json([]);
  }
});

app.post("/webhook/tip-added", (req, res) => {
  const { _queryData, _tipper } = web3.eth.abi.decodeParameters(
    ["bytes _queryData", "address _tipper"],
    req.body.logs[0].data
  );

  const event = {
    id: req.body.logs[0].transactionHash,
    _queryId: req.body.logs[0].topic1,
    _amount: Number(req.body.logs[0].topic2),
    _queryData,
    _tipper,
    _startTime: req.body.block.timestamp,
    txnHash: req.body.logs[0].transactionHash,
    __typename: "TipAddedEntity",
  };

  console.log(event);

  saveTipAddedEventData(event);

  res.json({ event });
});

app.post("/webhook/new-report", (req, res) => {
  const { _value, _nonce, _queryData } = web3.eth.abi.decodeParameters(
    ["bytes _value", "uint256 _nonce", "bytes _queryData"],
    req.body.logs[0].data
  );

  const event = {
    id: req.body.logs[0].transactionHash,
    _queryId: req.body.logs[0].topic1,
    _time: Number(req.body.logs[0].topic2),
    _value,
    _blockNumber: Number(req.body.block.number),
    _nonce: Number(_nonce),
    _queryData,
    _reporter: req.body.logs[0].topic3,
    txnHash: req.body.logs[0].transactionHash,
    __typename: "NewReportEntity",
  };

  console.log(event);

  saveNewReportEventData(event);

  res.json({ event });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
