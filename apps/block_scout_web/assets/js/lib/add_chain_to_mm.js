import 'bootstrap'

export async function addChainToMM({ btn }) {
  const chainIDFromEnvVar = parseInt(process.env.CHAIN_ID)
  const chainIDHex = chainIDFromEnvVar && `0x${chainIDFromEnvVar.toString(16)}`
  const p = {
    method: 'wallet_switchEthereumChain',
    params: [{
      chainId: chainIDHex
    }]
  };
  const res = await window.ethereum.request(p).catch(async e => {
    console.error('switch chain failed:', e)
    if (e && e.code === 4902) {
      const blockscoutURL = location.protocol + '//' + location.host
      const params = {
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainIDHex,
          chainName: process.env.SUBNETWORK,
          nativeCurrency: {
            name: process.env.COIN_NAME,
            symbol: process.env.COIN_NAME,
            decimals: 18
          },
          rpcUrls: [process.env.JSON_RPC],
          blockExplorerUrls: [blockscoutURL]
        }]
      };
      console.log(params);
      await window.ethereum.request(params).catch(e => {
        console.error('add chain failed:', e)
        btn.tooltip('dispose')
        btn.tooltip({
          title: `add custom chain failed, ${e.message}`,
          trigger: 'click',
          placement: 'bottom'
        }).tooltip('show')

        setTimeout(() => {
          btn.tooltip('dispose')
        }, 3000)
      })
    }
  })
  if(res === null){
    btn.tooltip('dispose')
        btn.tooltip({
          title: `You're already connected to ${process.env.SUBNETWORK}`,
          trigger: 'click',
          placement: 'bottom'
        }).tooltip('show')

        setTimeout(() => {
          btn.tooltip('dispose')
        }, 3000)
  }


  /* try {
    //const chainID = await window.ethereum.request({ method: 'eth_chainId' })
    const chainIDFromEnvVar = parseInt(process.env.CHAIN_ID)
    const chainIDHex = chainIDFromEnvVar && `0x${chainIDFromEnvVar.toString(16)}`
    const blockscoutURL = location.protocol + '//' + location.host
    const params = {
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIDHex,
        chainName: process.env.SUBNETWORK,
        nativeCurrency: {
          name: process.env.COIN_NAME,
          symbol: process.env.COIN_NAME,
          decimals: 18
        },
        rpcUrls: [process.env.JSON_RPC],
        blockExplorerUrls: [blockscoutURL]
      }]
    };
    console.log(params);
    if (chainID !== chainIDHex) {
      await window.ethereum.request(params)
    } else {
      btn.tooltip('dispose')
      btn.tooltip({
        title: `You're already connected to ${process.env.SUBNETWORK}`,
        trigger: 'click',
        placement: 'bottom'
      }).tooltip('show')

      setTimeout(() => {
        btn.tooltip('dispose')
      }, 3000)
    }
  } catch (error) {
    console.error(error)
  } */
}
