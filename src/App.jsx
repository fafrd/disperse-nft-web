import React from 'react';
import { ethers } from "ethers";

import './App.css';
import Validation from './Validation.jsx';
import DISPERSE_ABI from './DisperseNft.abi.json';
import ERC1155_ABI from './ERC1155.abi.json';

const SUPPORTED_CHAINIDS = [1, 4];
const NETWORK_NAMES = {1: "Ethereum Mainnet", 4: "Rinkeby Testnet"};
const DISPERSE_CONTRACT_ADDR = {
  1: "0xb26e9ff02fc659738c4a2888e0ed58ff0b7c2763",
  4: "0x7b194fBF78eeb62044985d37c9c4cDF6F4f0CA28",
}
const DISPERSE_CONTRACT_LINK = {
  1: <a href="https://etherscan.io/address/0xb26e9ff02fc659738c4a2888e0ed58ff0b7c2763">0xb26e9ff02fc659738c4a2888e0ed58ff0b7c2763</a>,
  4: <a href="https://rinkeby.etherscan.io/address/0x7b194fBF78eeb62044985d37c9c4cDF6F4f0CA28">0x7b194fBF78eeb62044985d37c9c4cDF6F4f0CA28</a>,
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      ethereum: null,
      provider: null,
      signer: null,
      connectedAccounts: [],
      walletStatus: 'no-wallet-detected',
      chainId: '',
      contract: '',
      recipients: '',
      parsedRecipients: [],
      ids: '',
      parsedIds: [],
      quantities: '',
      parsedQuantities: [],
      quantityToggle: 'quantityToggleManual',
      contractError: 'empty',
      recipientsError: 'empty',
      idsError: 'empty',
      quantitiesError: 'empty',
      txnHash: '',
      failureReason: '',
    };

    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.connectWallet = this.connectWallet.bind(this);
    this.switchNetwork = this.switchNetwork.bind(this);
  }

  async componentDidMount() {
    await this.setWalletState();
  }

  async setWalletState() {
    console.log("setWalletState");

    const { ethereum } = window;
    let provider = null, signer = null, walletStatus = "wallet-not-connected";
    if (ethereum) {
      provider = new ethers.providers.Web3Provider(ethereum);
      signer = provider.getSigner();
      const network = await provider.getNetwork();

      const connectedAccounts = await provider.listAccounts();
      console.log("connected accounts: " + JSON.stringify(connectedAccounts));

      if (connectedAccounts.length === 0) {
        console.debug("Setting wallet state: wallet-not-connected");
        walletStatus = "wallet-not-connected";
      } else if (!SUPPORTED_CHAINIDS.includes(network.chainId)) {
        console.debug("Setting wallet state: wrong-network");
        walletStatus = "wrong-network";
      } else {
        console.debug("Setting wallet state: empty (everything good)");
        walletStatus = "";
      }

      this.setState({
        ethereum: ethereum,
        provider: provider,
        signer: signer,
        chainId: network.chainId,
        connectedAccounts: connectedAccounts,
        walletStatus: walletStatus
      });

      // set up callback for network change
      ethereum.on("chainChanged", this.setWalletState.bind(this));

      // set up callback for account change
      ethereum.on("accountsChanged", this.setWalletState.bind(this));
    }
  }

  async connectWallet() {
    await this.state.ethereum.request({
      method: 'eth_requestAccounts'
    });
    const accts = await this.state.provider.listAccounts();
    if (accts.length > 0) {
      await this.setWalletState();
    } else {
      throw Error("Connected to ethereum but provider.listAccounts() returned empty!");
    }
  }

  async switchNetwork(event) {
    let desiredChainId;
    switch (event.target.id) {
      case "button-ethereum":
        desiredChainId = 1;
        break;
      case "button-rinkeby":
        desiredChainId = 4;
        break;
      default:
        throw new Error("unexpected switch fallthrough for button id " + event.target.id);
    }

    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x" + desiredChainId.toString(16) }],
    });

    this.setWalletState();
  }

  calcQtyFromIds(parsedIds) {
    return parsedIds.map(x => "1");
  }

  validateContract(contract) {
    if (!contract) {
      this.setState({contractError: "empty"});
    } else if (!contract.match(/^0x[a-fA-F0-9]{40}$/)) {
      this.setState({contractError: "Unable to parse contract address"});
    } else {
      this.setState({contractError: ""});
    }
  }

  validateRecipients(recipients) {
    this.setState({parsedRecipients: []});
    if (!recipients) {
      this.setState({recipientsError: "empty"});
    } else {
      try {
        const parsedRecipients = JSON.parse(recipients.replace(/'/g,'"'));

        const validAddresses = parsedRecipients.every(x => x.match(/^0x[a-fA-F0-9]{40}$/));
        if (!validAddresses) {
          this.setState({recipientsError: "Unable to parse recipient address."});
        } else {
          this.setState({recipientsError: ""});
          this.setState({parsedRecipients: parsedRecipients});
        }
      } catch {
        this.setState({recipientsError: "Unable to parse recipients array."});
      }
    }
  }

  validateIds(ids) {
    this.setState({parsedIds: []});
    if (!ids) {
      this.setState({idsError: "empty"});
    } else {
      try {
        const parsedIds = JSON.parse(ids.replace(/'/g,'"'));

        if (!parsedIds.every(x => typeof x === "string")) {
          this.setState({idsError: "Unable to parse ID as string."});
        } else {
          // success
          this.setState({idsError: ""});
          this.setState({parsedIds: parsedIds});

          if (this.state.quantityToggle === "quantityToggleAuto") {
            // Updating ID will also update quantities IF the qty toggle is set to Automatic
            this.setState({parsedQuantities: this.calcQtyFromIds(parsedIds)});
          } else {
            // else, re-validate qtys given new ids
            this.validateQuantities(parsedIds, this.state.quantities);
          }
        }
      } catch {
        this.setState({idsError: "Unable to parse IDs array."});
      }
    }
  }

  validateQuantities(ids, qtys) {
    if (this.state.quantityToggle === "quantityToggleAuto") {
      this.setState({quantitiesError: ""}); // do nothing; updated during ID validation
    } else if (!qtys) {
      this.setState({parsedQuantities: []});
      this.setState({quantitiesError: "empty"});
    } else {
      this.setState({parsedQuantities: []});
      try {
        const parsedQuantities = JSON.parse(qtys.replace(/'/g,'"'));

        if (!parsedQuantities.every(x => typeof x === "string")) {
          this.setState({quantitiesError: "Unable to parse quantity as string."});
        } else if (parsedQuantities.length !== ids.length) {
          this.setState({quantitiesError: `Invalid length \
            (found ${ids.length} IDs, but ${parsedQuantities.length} quantities)`});
        } else {
          this.setState({quantitiesError: ""});
          this.setState({parsedQuantities: parsedQuantities});
        }
      } catch {
        this.setState({quantitiesError: "Unable to parse quantities array."});
      }
    }
  }

  handleChange(event) {
    // Update state
    this.setState({[event.target.name]: event.target.value});

    // validate newly set state
    switch (event.target.name) {
      case "contract":
        this.validateContract(event.target.value);
        break;
      case "recipients":
        this.validateRecipients(event.target.value);
        break;
      case "ids":
        this.validateIds(event.target.value);
        break;
      case "quantities":
        this.validateQuantities(this.state.parsedIds, event.target.value);
        break;
      case "quantityToggle":
        if (event.target.value === "quantityToggleAuto") {
          // build quantity dynamically depending on input.
          this.setState({parsedQuantities: this.calcQtyFromIds(this.state.parsedIds)});
        }
        break;
      default:
        console.warn("unexpected switch fallthrough for event " + event.target.name);
    }
  }

  async handleSubmit() {
    console.log("Dispersing tokens");

    // Step 1: Check balance
    // Step 2: Set approval if necessary
    // Step 3: Disperse

    let nftContractAddr, recipients, ids, quantities;
    try {
      nftContractAddr = this.state.contract;
      recipients = JSON.parse(this.state.recipients);
      ids = JSON.parse(this.state.ids);
      if (this.state.quantityToggle === "quantityToggleAuto")
        quantities = this.state.parsedQuantities;
      else
        quantities = JSON.parse(this.state.quantities);
    } catch (err) {
      console.error(err);
      this.setState({
        failureReason: "Unable to parse parameters",
        walletStatus: "transaction-fail"
      });
      return;
    }

    console.log(`Ready to commit transaction. Parameters:
  contract: \t${JSON.stringify(nftContractAddr)},
  recipients: \t${JSON.stringify(recipients)},
  token ids: \t${JSON.stringify(ids)},
  quantities: \t${JSON.stringify(quantities)},
  binary data: \t"0x"
    `);

    let nftContract, balances;
    try {
      nftContract = await new ethers.Contract(this.state.contract, ERC1155_ABI, this.state.signer);
      const ownerAddresses = Array(ids.length).fill(this.state.connectedAccounts[0]);
      balances = await nftContract.balanceOfBatch(ownerAddresses, ids);
      console.log("balances: ");
      console.log(balances)

    } catch (err) {
      console.error(err);
      this.setState({
        failureReason: "Unable to determine contract balance. Did you provide a valid ERC-1155 NFT contract address?",
        walletStatus: "transaction-fail"
      });
      return;
    }

    for (var i = 0; i < ids.length; i++) {
      if (quantities[i] > parseInt(balances[i], 16)) {
        const err = `Insufficient balance for token ID ${ids[i]}. You are trying to send ${quantities[i]}, but have ${balances[i]}.`;
        console.error(err);
        this.setState({
          failureReason: err,
          walletStatus: "transaction-fail"
        });
        return;
      }
    }

    const disperseContractAddr = DISPERSE_CONTRACT_ADDR[this.state.chainId];
    if (!disperseContractAddr) {
      const err = "No contract address specified for chainId " + this.state.chainId;
      console.error(err);
      this.setState({
        failureReason: err,
        walletStatus: "transaction-fail"
      });
      return;
    }

    this.setState({walletStatus: "approve-pending"});

    let isApproved;
    try {
      isApproved = await nftContract.isApprovedForAll(this.state.connectedAccounts[0], disperseContractAddr);
    } catch (err) {
      console.error(err);
      this.setState({
        failureReason: "Unable to determine contract approval. Did you provide a valid ERC-1155 NFT contract address?",
        walletStatus: "transaction-fail"
      });
      return;
    }

    console.log("existing approval status: " + isApproved);

    if (!isApproved) {
      try {
        const tx = await nftContract.setApprovalForAll(disperseContractAddr, true);
        this.setState({
          txnHash: tx.hash,
          walletStatus: "approve-in-progress"
        });

        const receipt = await tx.wait();
        console.log("Transaction success. receipt: ");
        console.log(receipt);
      } catch (err) {
        console.error(err);
        this.setState({
          failureReason: JSON.stringify(err, null, 2),
          walletStatus: "transaction-fail"
        });
        return;
      }
    }

    this.setState({walletStatus: "disperse-pending"});

    const disperseContract = await new ethers.Contract(disperseContractAddr, DISPERSE_ABI, this.state.signer);
    try {
      const tx = await disperseContract.disperse(
        nftContractAddr,
        recipients,
        ids,
        quantities,
        "0x"
      );

      this.setState({
        txnHash: tx.hash,
        walletStatus: "disperse-in-progress"
      });

      const receipt = await tx.wait();
      console.log("Transaction success. receipt: ");
      console.log(receipt);
      this.setState({walletStatus: "disperse-success"});
    } catch (err) {
      console.error(err);
      this.setState({
        failureReason: JSON.stringify(err, null, 2),
        walletStatus: "transaction-fail"
      });
    }
  }

  render() {
    let contractPreview, recipientsPreview, idsPreview, quantitiesPreview;

    if (this.state.contractError) {
      contractPreview = <i>{this.state.contractError}</i>;
    } else {
      contractPreview = this.state.contract;
    }

    if (this.state.recipientsError) {
      recipientsPreview = <i>{this.state.recipientsError}</i>;
    } else {
      if (this.state.parsedRecipients.length === 1) {
        recipientsPreview = "1 recipient";
      } else {
        recipientsPreview = `${this.state.parsedRecipients.length} recipients`;
      }
    }

    if (this.state.idsError) {
      idsPreview = <i>{this.state.idsError}</i>;
    } else {
      if (this.state.parsedIds.length === 1) {
        idsPreview = "1 id";
      } else {
        idsPreview = `${this.state.parsedIds.length} ids`;
      }
    }

    if (this.state.quantityToggle === 'quantityToggleAuto') {
      quantitiesPreview = "1 of each ID, for each recipient";
    } else {
      if (this.state.quantitiesError) {
        quantitiesPreview = <i>{this.state.quantitiesError}</i>;
      } else {
        quantitiesPreview = this.state.quantities;
        if (this.state.parsedQuantities.length === 1) {
          quantitiesPreview = "1 quantity";
        } else {
          quantitiesPreview = `${this.state.parsedQuantities.length} quantities`;
        }
      }
    }

    const buttonDisabled = this.state.contractError
      || this.state.recipientsError
      || this.state.idsError
      || (this.state.quantitiesError && this.state.quantityToggle === 'quantityToggleManual');

    // Set quantity value dynamically, depending on manual/auto selection
    let quantityValue = this.state.quantities;
    let quantityDisabled = false;
    if (this.state.quantityToggle === "quantityToggleAuto") {
      quantityValue = JSON.stringify(this.state.parsedQuantities);
      quantityDisabled = true;
    }

    const networkName = NETWORK_NAMES[this.state.chainId] ? NETWORK_NAMES[this.state.chainId] : "unsupported network";
    const connectionStatusMessage = (this.state.connectedAccounts.length > 0 && this.state.provider) ? <p>Wallet connected to {networkName}.</p> : null;

    return <div className="App">
      <header className="App-header">
        <h1>Disperse NFT</h1>
        <h2>Batch-send your ERC1155 tokens to one or more recipients.</h2>
        <p>
          This tool allows you to send many ERC-1155 NFTs in a single transaction. This only works for NFTs that support multiple <i>copies</i> of the same NFT, such as Rarible multiples, or Curio Cards.
        </p>
        <p>
          <span>Source: <a href="https://github.com/fafrd/disperse-nft-contract">github.com/fafrd/disperse-nft-contract</a></span><br />
          <span className={SUPPORTED_CHAINIDS.includes(this.state.chainId) ? "" : "hidden"}>Contract: {DISPERSE_CONTRACT_LINK[this.state.chainId]}</span>
        </p>
      </header>

      <main className={this.state.walletStatus === "no-wallet-detected" ? "" : "hidden"}>
        <h3>No wallet detected. Install metamask: <a href="https://metamask.io/">metamask.io</a></h3>
      </main>

      <main className={this.state.walletStatus === "wallet-not-connected" ? "" : "hidden"}>
        <h3>Connect your wallet to continue: <button id="connect" type="button" onClick={this.connectWallet}>Connect Wallet</button></h3>
      </main>

      <main className={this.state.walletStatus === "wrong-network" ? "" : "hidden"}>
        <h3>Switch to a supported network to continue: </h3>
        <ul>
          {/* <li><h3><button className="switchNetwork" id="button-ethereum" type="button" onClick={this.switchNetwork}>Ethereum</button></h3></li> */}
          <li><h3><button className="switchNetwork" id="button-rinkeby" type="button" onClick={this.switchNetwork}>Rinkeby testnet</button></h3></li>
        </ul>
      </main>

      <main className={this.state.walletStatus === "approve-pending" ? "" : "hidden"}>
        <h3>Sign transaction to approve NFT dispersal...</h3>
      </main>

      <main className={this.state.walletStatus === "approve-in-progress" ? "" : "hidden"}>
        <h3>Approval transaction in progress. Tx hash: {this.state.txnHash}</h3>
      </main>

      <main className={this.state.walletStatus === "disperse-pending" ? "" : "hidden"}>
        <h3>Sign transaction to disperse NFT...</h3>
      </main>

      <main className={this.state.walletStatus === "disperse-in-progress" ? "" : "hidden"}>
        <h3>Disperse tranasction in progress. Tx hash: {this.state.txnHash}</h3>
      </main>

      <main className={this.state.walletStatus === "disperse-success" ? "" : "hidden"}>
        <h3>NFT dispersal complete! Tx hash: {this.state.txnHash}</h3>
      </main>

      <main className={this.state.walletStatus === "transaction-fail" ? "" : "hidden"}>
        <h3>NFT dispersal failed!</h3>
        <p><code>{this.state.failureReason}</code></p>
        <h3><button id="reset" type="button" onClick={() => this.setState({walletStatus: ""})}>Reset</button></h3>
      </main>

      <main className={this.state.walletStatus === "" ? "" : "hidden"}>
        <form autoComplete="off">
          <label htmlFor="contract">NFT contract <i>(address)</i></label>
          <div className="input-wrapper">
            <input type="text" name="contract" value={this.state.contract} autoComplete="off" onChange={this.handleChange} maxLength="42" placeholder="i.e. 0x73DA73EF3a6982109c4d5BDb0dB9dd3E3783f313" />
          </div>

          <label htmlFor="recipients">Recipients <i>(array of addresses, as strings)</i></label>
          <div className="input-wrapper">
            <input type="text" name="recipients" value={this.state.recipients} autoComplete="off" onChange={this.handleChange} placeholder='i.e. ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", ...]' />
          </div>

          <label htmlFor="ids">IDs <i>(array of NFT IDs, sorted, as strings)</i></label>
          <div className="input-wrapper">
            <input type="text" name="ids" value={this.state.ids} autoComplete="off" onChange={this.handleChange} placeholder='i.e. ["21", "22", "23"]' />
          </div>

          <label htmlFor="quantities">Quantities <i>(array of quantities, order corresponding to IDs, as strings)</i></label>

          <div className="input-radio-wrapper">
            <div className="input-radio-wrapper-item">
              <input type="radio" id="quantityToggleManual" name="quantityToggle" value="quantityToggleManual" onChange={this.handleChange} checked={this.state.quantityToggle === "quantityToggleManual"} />
              <label htmlFor="quantityToggleManual">Manual selection</label>
            </div>
            <div className="input-radio-wrapper-item">
              <input type="radio" id="quantityToggleAuto" name="quantityToggle" value="quantityToggleAuto" onChange={this.handleChange} checked={this.state.quantityToggle === "quantityToggleAuto"} />
              <label htmlFor="quantityToggleAuto">Automatic selection (1 of each ID, for each recipient)</label>
            </div>
          </div>

          <div className="input-wrapper quantity-input">
            <input type="text" name="quantities" value={quantityValue} disabled={quantityDisabled} autoComplete="off" onChange={this.handleChange} placeholder='i.e. ["1", "2", "1"]' />
          </div>

        </form>

        {connectionStatusMessage}
        <p>Contract: {contractPreview} <Validation valid={!this.state.contractError} /></p>
        <p>Recipients: {recipientsPreview} <Validation valid={!this.state.recipientsError} /></p>
        <p>NFT IDs: {idsPreview} <Validation valid={!this.state.idsError} /></p>
        <p>Quantities: {quantitiesPreview} <Validation valid={this.state.quantityToggle === "quantityToggleAuto" || !this.state.quantitiesError} /></p>

        <div className="button-container">
          <button id="disperse" type="button" disabled={buttonDisabled} onClick={this.handleSubmit}>Disperse</button>
        </div>

      </main>

    </div>;
  }
}

export default App;
