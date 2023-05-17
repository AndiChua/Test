import { ReactComponent as IconDoubleCheck } from "@/assets/svgs/icon-check-double.svg";
import { ReactComponent as IconClock } from "@/assets/svgs/icon-clock.svg";
import IconDotted from "@/assets/svgs/icon-dotted.svg";
import { ReactComponent as IconEllipse } from "@/assets/svgs/icon-ellipse.svg";
import { ReactComponent as IconFlag } from "@/assets/svgs/icon-flag.svg";
import { ReactComponent as IconRecordTransfer } from "@/assets/svgs/transferrable.svg";
import Button from "@/components/Button";
import Toast from "@/components/Toast/index";
import addressTypes from "@/constants/address-type/index";
import { etrActionable, etrActions } from "@/constants/etr-action";
import toastType from "@/constants/toast-type/index";
import tradeTrustType from "@/constants/trade-trust-type/index";
import useCDI from '@/hooks/use-cdi';
import useConfig from '@/hooks/use-config/index';
import useDid from "@/hooks/use-did";
import useEtr from '@/hooks/use-etr/index';
import useRecordDetail from "@/hooks/use-record-detail/index";
import useToast from "@/hooks/use-toast/index";
import VerificationStatus from "@/pages/record-transfer/record-details-side-panel/components/verificationStatus/verificationStatus.jsx";
import ETR_API from "@/services/api/etr";
import API_FILES from '@/services/api/files.js';
import handle from '@/utils/handle';
import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { useSelector } from "react-redux";
import { useHistory } from "react-router-dom";
import ActionableButton from "./components/actionable-button/index";
import UpdateWallet from "./components/update-wallet/index";

const RecordDetailsSidePanel = () => {
	const ttData = useSelector((state) => state.tt);
	const ttFile = ttData?.file;

	const [submitLoading, setSubmitLoading] = useState(false);

	const history =	useHistory()

	const { push, } = useCDI()

	const dataElementId = "ebl"

	const { toastList, addToastMessage } = useToast()
	const { identity, provideItems, consumeItems, error: errorConfig } = useConfig()
	const { toFindDid, toFindOrgName } = useDid()
	const { fetchEtr, etrData, etrErrorMsg } = useEtr({
		dataElementId,
		configData: {
			consumeItems,
			provideItems,
			identity
		}
	})
	const { uploadRecordDetail, recordDetailErrorMsg, recordDetailLoading, setRecordDetailLoading } = useRecordDetail();

	useEffect(() => {
		addToastMessage(recordDetailErrorMsg, toastType.error)
	}, [recordDetailErrorMsg])

	const userOrganizationId = identity?.organization?.id;
	const organizationWallet = toFindDid(userOrganizationId)

	useEffect(() => {
		if((provideItems || consumeItems) && identity){
			fetchEtr()
		}
	}, [provideItems, identity, consumeItems])

	useEffect(() => {
		addToastMessage(errorConfig, toastType.error)
	}, [errorConfig])

	const {
		domainName,
		nftRegistry,
		holder,
		owner,
		networkLabel,
		verificationFragments,
		nominatedBeneficiary,
		ttStatus,
		tokenRegistryAddress,
		tokenId,
		docData,
		endorsementChain
	} = ttData.data;;

	const [action, setAction] = useState(null)

	function checkAction(){
		const emptyAddress = "0x0000000000000000000000000000000000000000";

		if (organizationWallet === owner && organizationWallet === holder){
			return etrActions.ownerAndHolder
		}

		if(organizationWallet === owner){
			return etrActions.ownerOnly
		}

		if(organizationWallet === holder && nominatedBeneficiary !== emptyAddress){
			return etrActions.holderAndEndorseOwner
		}

		if (organizationWallet === holder){
			return etrActions.holderOnly
		}

		return etrActions.none
	}

	const [selectedOwner, setSelectedOwner] = useState(null)
	const [selectedHolder, setSelectedHolder] = useState(null)

	function getOrgName(walletAddress){
		const orgName = toFindOrgName(walletAddress)
		if(orgName){
			return orgName
		}

		if(etrData.some(item => item.walletAddress === walletAddress)){
			return etrData.find((item) => item.walletAddress === walletAddress).name
		}

		return null
	}

	function checkDisabled() {
		if (action === etrActionable.transferOwnerAndHolder) {
			return (selectedOwner === null || selectedHolder === null);
		}
		if (action === etrActionable.transferOwner) {
			return (selectedOwner === null);
		}
		if (action === etrActionable.transferHolder) {
			return (selectedHolder === null);
		}
		return true;
	}

	async function handleTransport(partcipant, type, emailInformation){
		if(type === addressTypes.pitstop){
			const participant = provideItems.filter(item => item.id === dataElementId)[0].to.filter(item => item.id === partcipant.id)

			let attachmentData = []
			const [errorUploadFile, uploadFilesResult] = await API_FILES.upload([ttFile])

			if (errorUploadFile) {
				return addToastMessage(errorUploadFile, toastType.error);
			}

			attachmentData = uploadFilesResult?.reduce((pre, cur) => [...pre, ...cur.data.data], [])

			const payload = {
				participants: participant,
				payload: [
					{
						ebl_reference: ttData.data?.docData?.blNumber,
						attachments: attachmentData
					}
				],
				on_behalf_of: [],
			}

			const [errorPushDataElement] = await handle(push(dataElementId, payload))

			if (errorPushDataElement) {
				return addToastMessage(errorPushDataElement, toastType.error);
			}
		}

		if(type === addressTypes.saved){
			const payload = {
				to: partcipant.email,
				name: partcipant.name,
				action: emailInformation.action,
				type: emailInformation.type
			}

			const [error] = await ETR_API.transport(payload,ttFile)
			if (error) {
				return addToastMessage(error, toastType.error);
			}
		}

		return true
	}

	async function handleNominateNSurrender(type){
		if(submitLoading){
			return
		}

		setSubmitLoading(true)

		const createPayload = (newBeneficiary, newHolder) => {
			let payload= {
				tokenRegistryAddress: tokenRegistryAddress,
				chainId: docData?.network?.chainId,
				tokenId: tokenId,
				orgId: identity?.organization?.id,
				systemId: identity?.id
			}
			if(newBeneficiary){
				payload=  {...payload, newBeneficiary}
			}
			if(newHolder){
				payload=  {...payload, newHolder}
			}
			return payload
		};

		const handleApiCall = async (payload, apiFunc) => {
			const [error] = await apiFunc(payload);

			if (error) {
				setSubmitLoading(false)
				return addToastMessage(error, toastType.error);
			}
		}

		let payload;
		switch(type) {
			case etrActionable.endorseOwner:
					payload = createPayload(nominatedBeneficiary, null);
					await handleApiCall(payload, ETR_API.endorseOwner);
					await handleTransport(nominatedBeneficiary, nominatedBeneficiary.type, {
						action: "endorse",
						type: "ownership"
					})
				break;

			case etrActionable.surrender:
					payload = createPayload(null, null);
					await handleApiCall(payload, ETR_API.surrenderTT);
				break;

			default:
				break;
		}

		uploadRecordDetail(ttFile)

		history.push('/record-transfer/success',{type: action})
	}

	async function handleTransfer(){
		if(submitLoading){
			return
		}

		setSubmitLoading(true)

		const createPayload = (newBeneficiary, newHolder) => {
			let payload= {
				tokenRegistryAddress: tokenRegistryAddress,
				chainId: docData?.network?.chainId,
				tokenId: tokenId,
				orgId: identity?.organization?.id,
				systemId: identity?.id
			}
			if(newBeneficiary){
				payload=  {...payload, newBeneficiary}
			}
			if(newHolder){
				payload=  {...payload, newHolder}
			}
			return payload
		};

		const handleApiCall = async (payload, apiFunc) => {
			const [error] = await apiFunc(payload);

			if (error) {
				setSubmitLoading(false)
				return addToastMessage(error, toastType.error);
			}

			return true
		}

		let payload;
		switch(action) {
			case etrActionable.transferOwnerAndHolder:
				payload = createPayload(
					selectedOwner.walletAddress,
					selectedOwner.walletAddress === selectedHolder.walletAddress ? selectedHolder.walletAddress : null
				);

				if(selectedOwner.walletAddress === selectedHolder.walletAddress){
					await handleApiCall(payload, ETR_API.endorseOwnerAndHolder);
					await handleTransport(selectedOwner, selectedOwner.type, {
						action: "transfer",
						type: "both"
					})

				} else {
					await handleApiCall({ ...payload, newHolder: null }, ETR_API.nominateOwner);
					await handleTransport(selectedOwner, selectedOwner.type, {
						action: "nominate",
						type: "ownership"
					})
					await handleApiCall({ ...payload, newBeneficiary: null }, ETR_API.transferHoldership);
					await handleTransport(selectedHolder, selectedHolder.type, {
						action: "transfer",
						type: "holdership"
					})
				}
				break;

			case etrActionable.transferOwner:
					payload = createPayload(selectedOwner.walletAddress, null);
					await handleApiCall(payload, ETR_API.nominateOwner);
					await handleTransport(selectedOwner, selectedOwner.type, {
						action: "nominate",
						type: "ownership"
					})
				break;

			case etrActionable.transferHolder:
					payload = createPayload(selectedHolder.walletAddress,null);
					await handleApiCall(payload, ETR_API.transferHoldership);
					await handleTransport(selectedHolder, selectedHolder.type, {
						action: "transfer",
						type: "holdership"
					})
				break;

			default:
				break;
		}

		uploadRecordDetail(ttFile)

		history.push('/record-transfer/success',{type: action})
	}

	const GetStatus = () => {
		if(!nftRegistry){
			return (
				<div data-testid="verifiable" className="icon_user_group">
					<div className="icon_user_group__margin__right">
						<IconDoubleCheck />
					</div>
					Verifiable
				</div>
			)
		}

		if(ttStatus === tradeTrustType.active || ttStatus === tradeTrustType.unknown){
			if(nftRegistry){
				return (
					<div data-testid="transferrable" className="icon_user_group">
						<div className="icon_record__margin__right">
							<IconRecordTransfer />
						</div>
						Transferrable
					</div>
				)
			}
		}
		if (ttStatus === tradeTrustType.surrendertoIssuer) {
			return (
				<div data-testid="verifiable" className="icon_user_group icon_user_group--surrendered">
					<div className="icon_user_group__margin__right">
						<IconFlag />
					</div>
					Surrendered to issuance
				</div>
			)
		}

		if (ttStatus === tradeTrustType.shredded) {
			return (
				<div data-testid="verifiable" className="icon_user_group icon_user_group--shredded">
					<div className="icon_user_group__margin__right">
						<IconFlag />
					</div>
					Surrendered
				</div>
			)
		}

		return <></>
	}

	return (
		<>
			<div className="record_details_side_panel__flex" data-testid="record_details_side_panel__flex">
				<div className="record_details_header__color__purple">
					Record Details
				</div>
				{(action === null || action === etrActionable.surrender) && (
					<>
						{ttStatus !== tradeTrustType.unknown && (
							<div className="status_container__flex">
								<div className="status_title record_details_title__grey">
									Status:
								</div>
								<div className="status_label_container status_label_container__flex">
									<GetStatus />
								</div>
							</div>
						)}

						{networkLabel && (
							<div className="verification_container__flex">
								<div className="verified_label__grey60">
									Verified on: {networkLabel}
								</div>
								<div className="verification_checks__flex">
									<VerificationStatus
										verificationFragments={verificationFragments}
									/>
								</div>
							</div>
						)}

						{domainName && (
							<div className="issuer_container">
								<div className="issuer_title__margin__btm record_details_title__grey">
									Issuer:
								</div>
								<div className="issuer_name__color__secondary" data-testid="issuer_name__color__secondary">
									{domainName.toUpperCase()}
								</div>
							</div>
						)}

						{nftRegistry && (
							<>
								{(endorsementChain && endorsementChain?.length > 0) && (
									<div className="nft_infor_container">
										<div className="nft_information_title__margin__btm record_details_title__grey">
											NFT Information:
										</div>
										<div className="nft_information">
											<a
												href={nftRegistry}
												target="_blank"
												rel="noopener noreferrer"
												className="nftRegistry"
											>
												NFT Registry
											</a>
											<div className="endorsement_chain_div"
												onClick={()=>{
													history.push(`/record-transfer/endorsement-chain`, {endorsementChain})
												}}
											>
												Endorsement Chain
											</div>
										</div>
									</div>
								)}

								{(owner && holder) && (
									<>
										{(checkAction() === etrActions.holderAndEndorseOwner) && (
											<div className="endorsement_container">
												<div className="etr__update-wallet__title">
													Owner: <span className="etr__update__pending-transfer">
														<IconClock /> Pending Transfer Endorsement
													</span>
												</div>
												<div className="etr__update-wallet__content">
													<div className="etr__update-wallet__section etr__update-wallet__top">
														<div className="etr__update-wallet__left">
															<IconEllipse />
															<div className="etr__update-wallet__line"
																style={{backgroundImage: `url(${IconDotted})`}}
															>
															</div>
														</div>
														<div className="etr__update-wallet__right">
															<div className="etr__update-wallet__upper etr__update-wallet__text">
																{(getOrgName(owner) !== null) && (
																	<div className="etr__update-wallet__upper etr__update-wallet__text">
																		{getOrgName(owner)} {owner === organizationWallet && (
																			<>
																				<span className="etr__update-wallet__text--subtitle">(Your Address)</span>
																			</>
																		)}
																	</div>
																)}
															</div>
															<div className="etr__update-wallet__text--subtitle">
																{owner}
															</div>
														</div>
													</div>
													<div className="etr__update-wallet__section etr__update-wallet__bottom">
														<div className="etr__update-wallet__left etr__update-wallet__left--active">
															<IconEllipse />
														</div>
														<div className="etr__update-wallet__right">
															<div className="etr__update-wallet__upper etr__update-wallet__text">
																<div className="etr__update-wallet__upper etr__update-wallet__text">
																	{(getOrgName(nominatedBeneficiary) !== null) && (
																		<>
																			{getOrgName(nominatedBeneficiary)}
																		</>
																	)}

																	{nominatedBeneficiary === organizationWallet && (
																		<>
																			<span className="etr__update-wallet__text--subtitle">(Your Address)</span>
																		</>
																	)}
																	{nominatedBeneficiary !== organizationWallet && (
																		<>
																			<span className="etr__update-wallet__text--subtitle">(Nominated Owner)</span>
																		</>
																	)}
																</div>
															</div>
															<div className="etr__update-wallet__text--subtitle" data-testid='nominatedBeneficiary_detail'>
																{nominatedBeneficiary}
															</div>
														</div>
													</div>
												</div>
											</div>
										)}

										{!(checkAction() === etrActions.holderAndEndorseOwner) && (
											<div className="owner_container record_details_title__grey">
												<div className="owner_title__margin__btm">Owner:</div>
												{(getOrgName(owner) !== null) && (
													<div className="etr__update-wallet__upper etr__update-wallet__text">
														{getOrgName(owner)} {owner === organizationWallet && (
															<>
																<span className="etr__update-wallet__text--subtitle">(Your Address)</span>
															</>
														)}
													</div>
												)}

												<div className="owner_detail" data-testid="owner_detail">
													{owner}
												</div>
											</div>
										)}

										<div className="holder_container record_details_title__grey">
											<div className="holder_title__margin__btm">Holder:</div>
											{(getOrgName(holder) !== null) && (
												<div className="etr__update-wallet__upper etr__update-wallet__text">
													{getOrgName(holder)} {holder === organizationWallet && (
														<>
															<span className="etr__update-wallet__text--subtitle">(Your Address)</span>
														</>
													)}
												</div>
											)}
											<div className="holder_detail" data-testid="holder_detail">
												{holder}
											</div>
										</div>
										{!(ttStatus === tradeTrustType.surrendertoIssuer || ttStatus === tradeTrustType.shredded) && (
											<>
												<ActionableButton
													setAction={setAction}
													checkAction={checkAction()}
													handleNominateNSurrender={handleNominateNSurrender}
												/>

												<div className="share_etr__color__purple60">
													Share E-Transferrable Record
												</div>
											</>
										)}
									</>
								)}
							</>
						)}
					</>
				)}
				{!(action ===  null || action === etrActionable.surrender) && (
					<>
						<UpdateWallet
							title="Owner"
							currentWallet={owner}
							addressBook={etrData}
							fetchEtr={fetchEtr}
							addToastMessage={addToastMessage}
							selectedWallet={selectedOwner}
							setSelectedWallet={setSelectedOwner}
							isSelectable={action === etrActionable.transferOwnerAndHolder || action === etrActionable.transferOwner}
						/>
						<UpdateWallet
							title="Holder"
							currentWallet={holder}
							addressBook={etrData}
							fetchEtr={fetchEtr}
							addToastMessage={addToastMessage}
							selectedWallet={selectedHolder}
							setSelectedWallet={setSelectedHolder}
							isSelectable={action === etrActionable.transferOwnerAndHolder || action === etrActionable.transferHolder}
						/>
						<div className="etr__submit">
							<Button
								text="Transfer"
								disabled={checkDisabled()}
								submit={()=> {handleTransfer()}}
							/>
						</div>
					</>
				)}
			</div>

			<Toast toastList={toastList}  />

			{
				submitLoading && (
					ReactDOM.createPortal(
						<div className='modal white'>
							<div className='loading'>
								<img src="/loading.gif" />
							</div>
						</div>
						, document.body
					)
				)
			}
		</>
	);
};

export default RecordDetailsSidePanel;
